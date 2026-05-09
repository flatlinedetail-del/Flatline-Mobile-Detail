import {
  collection, query, where, getDocs, addDoc, updateDoc, doc,
  serverTimestamp, Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import type {
  FormTemplate, FormInstance, SignedFormRecord,
  FormRequirement, FormComplianceStatus, FormInstanceStatus,
} from "../types/forms";

function generateToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export async function loadActiveFormTemplates(): Promise<FormTemplate[]> {
  const snap = await getDocs(
    query(collection(db, "form_templates"), where("isActive", "==", true))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as FormTemplate));
}

export function resolveRequiredForms(
  templates: FormTemplate[],
  serviceIds: string[],
  addonIds: string[],
  clientRiskLevel?: string | null,
  totalPrice?: number,
): FormRequirement[] {
  const requirements: FormRequirement[] = [];
  const seen = new Set<string>();

  for (const tpl of templates) {
    if (!tpl.isActive) continue;

    const serviceMatch = tpl.assignedServices.some(id => serviceIds.includes(id));
    const addonMatch = tpl.assignedAddons.some(id => addonIds.includes(id));
    const riskMatch =
      tpl.riskTriggers?.length &&
      clientRiskLevel &&
      tpl.riskTriggers.includes(clientRiskLevel);
    const priceMatch =
      tpl.priceThreshold != null &&
      totalPrice != null &&
      totalPrice >= tpl.priceThreshold;

    if (serviceMatch || addonMatch || riskMatch || priceMatch) {
      if (seen.has(tpl.id)) continue;
      seen.add(tpl.id);

      let reason = "";
      if (serviceMatch) reason = "Required by selected service";
      else if (addonMatch) reason = "Required by selected add-on";
      else if (riskMatch) reason = `Triggered by client risk level: ${clientRiskLevel}`;
      else if (priceMatch) reason = `Required for jobs over $${tpl.priceThreshold}`;

      requirements.push({
        template: tpl,
        reason,
        required: tpl.enforcement !== "optional",
      });
    }
  }

  return requirements;
}

export async function getSignedFormsForAppointment(
  appointmentId: string,
): Promise<SignedFormRecord[]> {
  const snap = await getDocs(
    query(collection(db, "signed_forms"), where("appointmentId", "==", appointmentId))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as SignedFormRecord));
}

export async function getSignedFormsForClient(
  clientId: string,
): Promise<SignedFormRecord[]> {
  const snap = await getDocs(
    query(collection(db, "signed_forms"), where("clientId", "==", clientId))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as SignedFormRecord));
}

function isSignatureValid(
  signed: SignedFormRecord,
  tpl: FormTemplate,
  vehicleId?: string,
): boolean {
  if (signed.formId !== tpl.id) return false;

  const freq = tpl.signatureFrequency ?? "every_job";
  if (freq === "every_job") return true;

  if (freq === "once_per_vehicle" && vehicleId) {
    return signed.vehicleId === vehicleId;
  }

  if (freq === "expires_after" && tpl.expiresAfterDays) {
    const signedDate = signed.signedAt instanceof Timestamp
      ? signed.signedAt.toDate()
      : new Date(signed.signedAt as any);
    const expiry = new Date(signedDate);
    expiry.setDate(expiry.getDate() + tpl.expiresAfterDays);
    return expiry > new Date();
  }

  return true;
}

export async function checkFormCompliance(
  appointmentId: string,
  clientId: string,
  serviceIds: string[],
  addonIds: string[],
  clientRiskLevel?: string | null,
  totalPrice?: number,
  vehicleId?: string,
): Promise<FormComplianceStatus> {
  const [templates, appointmentSigned, clientSigned] = await Promise.all([
    loadActiveFormTemplates(),
    getSignedFormsForAppointment(appointmentId),
    getSignedFormsForClient(clientId),
  ]);

  const allSigned = [...appointmentSigned, ...clientSigned];
  const requirements = resolveRequiredForms(
    templates, serviceIds, addonIds, clientRiskLevel, totalPrice,
  );

  const signed: SignedFormRecord[] = [];
  const pending: FormRequirement[] = [];

  for (const req of requirements) {
    const match = allSigned.find(s =>
      isSignatureValid(s, req.template, vehicleId)
    );
    if (match) {
      signed.push(match);
    } else {
      pending.push(req);
    }
  }

  const requiredPending = pending.filter(p => p.required);

  return {
    allSigned: requiredPending.length === 0,
    required: requirements,
    signed,
    pending,
    canStartJob: requiredPending.length === 0,
  };
}

export async function createFormInstances(
  appointmentId: string,
  clientId: string,
  requirements: FormRequirement[],
  vehicleId?: string,
): Promise<FormInstance[]> {
  const instances: FormInstance[] = [];

  for (const req of requirements) {
    const instance: Omit<FormInstance, "id"> = {
      templateId: req.template.id,
      templateTitle: req.template.title,
      templateVersion: req.template.version ?? 1,
      appointmentId,
      clientId,
      vehicleId,
      status: "pending",
      required: req.required,
      signingToken: generateToken(),
      createdAt: Timestamp.now(),
    };

    const docRef = await addDoc(collection(db, "form_instances"), instance);
    instances.push({ id: docRef.id, ...instance });
  }

  return instances;
}

export async function getFormInstancesByAppointment(
  appointmentId: string,
): Promise<FormInstance[]> {
  const snap = await getDocs(
    query(collection(db, "form_instances"), where("appointmentId", "==", appointmentId))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as FormInstance));
}

export async function getFormInstanceByToken(
  token: string,
): Promise<FormInstance | null> {
  const snap = await getDocs(
    query(collection(db, "form_instances"), where("signingToken", "==", token))
  );
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as FormInstance;
}

export async function updateFormInstanceStatus(
  instanceId: string,
  status: FormInstanceStatus,
  extra?: Record<string, any>,
): Promise<void> {
  await updateDoc(doc(db, "form_instances", instanceId), {
    status,
    ...extra,
    updatedAt: serverTimestamp(),
  });
}

export async function waiveFormInstance(
  instanceId: string,
  waivedBy: string,
  reason: string,
): Promise<void> {
  await updateFormInstanceStatus(instanceId, "waived", {
    waivedAt: serverTimestamp(),
    waivedBy,
    waivedReason: reason,
  });
}

export function getSigningUrl(token: string): string {
  const base = window.location.origin;
  return `${base}/sign/${token}`;
}
