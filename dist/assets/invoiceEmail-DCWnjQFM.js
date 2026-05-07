import{L as I,l as a}from"./index-CG8fL7A2.js";const r=e=>String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"),i=e=>String(e??"").replace(/\s+/g," ").trim(),z=e=>{var n;const t=((n=e==null?void 0:e.toDate)==null?void 0:n.call(e))||e||new Date,d=t instanceof Date?t:new Date(t);return Number.isNaN(d.getTime())?new Date().toLocaleDateString():d.toLocaleDateString(void 0,{month:"short",day:"numeric",year:"numeric"})},H=(e,t)=>e?`${t.replace(/\/$/,"")}/pay/invoice/${encodeURIComponent(e)}`:null,D=e=>{if(!e||typeof e!="string"||e.includes("[object Object]"))return"Services were selected based on the vehicle condition, service needs, and requested work.";const t=["optimized at","revenue generation","tactical routing","internal log","system id","revenue protocol","client strategy","strategic opportunity"],d=e.replace(/\[[A-Z\s_]+\]/g,"").split(`
`).map(n=>n.trim()).filter(n=>n&&!t.some(p=>n.toLowerCase().includes(p))).join(" ");return d.length>=5?d:"Service details were selected based on standard service procedures."},S=e=>[e==null?void 0:e.year,e==null?void 0:e.make,e==null?void 0:e.model].filter(Boolean).join(" ").trim()||"Vehicle",l=(e,t,d="#111827")=>!Number.isFinite(t)||t===0?"":`
    <tr>
      <td style="padding:6px 0;color:#4b5563;font-size:13px;font-weight:700;">${r(e)}</td>
      <td style="padding:6px 0;color:${d};font-size:13px;font-weight:800;text-align:right;">${a(t)}</td>
    </tr>
  `;function B({invoice:e,settings:t,paymentUrl:d}){var k;const n=e.invoiceNumber||(e.id?e.id.slice(-6).toUpperCase():"PREVIEW"),p=(t==null?void 0:t.businessName)||"Flatline Mobile Detail",A=I((t==null?void 0:t.invoiceAddress)||(t==null?void 0:t.baseAddress)||""),N=I(e.serviceAddress||e.clientAddress||"Service address not recorded"),g=Number(e.subtotal??((k=e.lineItems)==null?void 0:k.reduce((o,x)=>o+Number(x.total??(x.price||0)*(x.quantity||1)),0))??0),s=Number(e.discountAmount||0),b=Number(e.travelFeeAmount||0),F=Array.isArray(e.customFees)?e.customFees:[],T=F.reduce((o,x)=>o+Number(x.amount||0),0),u=Number(e.afterHoursFeeAmount||0),m=(g-s)*Number((t==null?void 0:t.taxRate)||0)/100,w=Number(e.total??g-s+b+T+u+m),c=Number(e.amountPaid||0),P=Math.max(w-c,0),h=Array.isArray(e.lineItems)?e.lineItems:[],y=Array.isArray(e.vehicles)?e.vehicles:[],$=String(e.paymentStatus||e.status||"pending").toUpperCase(),f=e.dueDate?z(e.dueDate):null,v=i(e.paymentTerms||e.terms||(f?"Due by due date":"Due on receipt")),L=`<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:760px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e5e7eb;box-shadow:0 18px 45px rgba(15,23,42,0.10);">
            <tr>
              <td style="padding:34px 34px 26px;border-bottom:1px solid #eef2f7;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="vertical-align:top;padding-bottom:18px;">
                      ${t!=null&&t.logoUrl&&t.showLogoOnDocuments!==!1?`<img src="${r(t.logoUrl)}" alt="${r(p)}" style="max-height:58px;max-width:220px;display:block;">`:`<div style="font-size:25px;line-height:1;font-weight:900;letter-spacing:-1px;color:#0A4DFF;text-transform:uppercase;font-style:italic;">${r(p)}</div>`}
                      <div style="margin-top:16px;color:#111827;font-size:13px;line-height:1.6;font-weight:600;">
                        <div style="font-weight:800;">${r(p)}</div>
                        ${A?`<div>${r(A)}</div>`:""}
                        ${t!=null&&t.businessPhone?`<div>${r(t.businessPhone)}</div>`:""}
                        ${t!=null&&t.businessEmail?`<div>${r(t.businessEmail)}</div>`:""}
                      </div>
                    </td>
                    <td style="vertical-align:top;text-align:right;padding-bottom:18px;">
                      <div style="font-size:38px;line-height:1;font-weight:900;letter-spacing:-1px;text-transform:uppercase;color:#111827;">Invoice</div>
                      <div style="margin-top:12px;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:1.5px;color:#111827;">Invoice # <span style="color:#0A4DFF;">${r(n)}</span></div>
                      <div style="margin-top:6px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:#4b5563;">Date ${r(z(e.createdAt))}</div>
                      <div style="margin-top:6px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:#4b5563;">Terms ${r(v)}</div>
                      <div style="margin-top:6px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:#4b5563;">Due ${r(f||"On receipt")}</div>
                      <div style="display:inline-block;margin-top:14px;padding:7px 12px;border-radius:999px;background:${$==="PAID"?"#dcfce7":"#fef3c7"};color:${$==="PAID"?"#15803d":"#92400e"};font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:1px;">${r($)}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:30px 34px;background:#fbfdff;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="50%" style="vertical-align:top;padding-right:18px;">
                      <div style="font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:1.8px;color:#111827;border-bottom:2px solid #dbeafe;padding-bottom:8px;">Bill To</div>
                      <div style="padding-top:14px;font-size:14px;line-height:1.6;color:#111827;">
                        <div style="font-size:20px;font-weight:900;">${r(e.clientName||"Customer")}</div>
                        ${e.businessName&&e.businessName!==e.clientName?`<div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:1px;">${r(e.businessName)}</div>`:""}
                        ${e.clientEmail?`<div>${r(e.clientEmail)}</div>`:""}
                        ${e.clientPhone?`<div>${r(e.clientPhone)}</div>`:""}
                      </div>
                    </td>
                    <td width="50%" style="vertical-align:top;padding-left:18px;">
                      <div style="font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:1.8px;color:#111827;border-bottom:2px solid #dbeafe;padding-bottom:8px;">Service Location</div>
                      <div style="margin-top:14px;padding:14px;border:1px solid #e5e7eb;border-radius:12px;background:#ffffff;font-size:13px;line-height:1.5;font-weight:700;color:#111827;">${r(N)}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:0 34px 30px;background:#fbfdff;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="50%" style="vertical-align:top;padding-right:18px;">
                      <div style="font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:1.8px;color:#111827;border-bottom:2px solid #dbeafe;padding-bottom:8px;">Vehicle Info</div>
                      <div style="padding-top:12px;">
                        ${y.length?y.map(o=>`
                          <div style="padding:12px 14px;border:1px solid #e5e7eb;border-radius:12px;background:#ffffff;margin-bottom:8px;">
                            <div style="font-size:14px;font-weight:900;color:#111827;">${r(S(o))}</div>
                            ${o.roNumber?`<div style="font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:1px;color:#0A4DFF;margin-top:4px;">RO: ${r(o.roNumber)}</div>`:""}
                          </div>
                        `).join(""):`<div style="font-size:13px;color:#6b7280;padding-top:12px;">${r(e.vehicleInfo||"Vehicle information not recorded")}</div>`}
                      </div>
                    </td>
                    <td width="50%" style="vertical-align:top;padding-left:18px;">
                      <div style="font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:1.8px;color:#111827;border-bottom:2px solid #dbeafe;padding-bottom:8px;">Service Description</div>
                      <div style="margin-top:14px;padding:14px;border:1px solid #e5e7eb;border-radius:12px;background:#ffffff;font-size:13px;line-height:1.6;color:#111827;">${r(D(e.description))}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:0 34px 30px;">
                <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
                  <thead>
                    <tr style="background:#f3f4f6;">
                      <th align="left" style="padding:14px 16px;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:1px;color:#111827;">Description</th>
                      <th align="center" style="padding:14px 16px;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:1px;color:#111827;">Qty</th>
                      <th align="right" style="padding:14px 16px;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:1px;color:#111827;">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${h.length?h.map(o=>`
                      <tr>
                        <td style="padding:16px;border-top:1px solid #f3f4f6;">
                          <div style="font-size:14px;font-weight:900;color:#111827;">${r(o.serviceName||"Service")}</div>
                          ${o.description?`<div style="font-size:11px;line-height:1.5;color:#4b5563;margin-top:5px;">${r(D(o.description))}</div>`:""}
                        </td>
                        <td align="center" style="padding:16px;border-top:1px solid #f3f4f6;font-size:13px;font-weight:800;color:#111827;">${r(o.quantity||1)}</td>
                        <td align="right" style="padding:16px;border-top:1px solid #f3f4f6;font-size:13px;font-weight:900;color:#111827;">${a(Number(o.total??(o.price||0)*(o.quantity||1)))}</td>
                      </tr>
                    `).join(""):'<tr><td colspan="3" style="padding:16px;font-size:13px;color:#6b7280;">No line items recorded.</td></tr>'}
                  </tbody>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:0 34px 34px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="vertical-align:top;font-size:12px;line-height:1.6;color:#6b7280;padding-right:24px;">
                      Payment terms: <strong style="color:#111827;">${r(v)}</strong>${f?`, due ${r(f)}`:""}. Thank you for choosing ${r(p)}.
                    </td>
                    <td width="310" style="vertical-align:top;background:#f9fafb;border:1px solid #e5e7eb;border-radius:14px;padding:18px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                        ${l("Subtotal",g)}
                        ${s>0?l("Discount",-s,"#16a34a"):""}
                        ${l((t==null?void 0:t.serviceFeeLabel)||"Travel Fee",b)}
                        ${F.map(o=>l(o.label||"Custom Fee",Number(o.amount||0))).join("")}
                        ${l("After-Hours Fee",u,"#d97706")}
                        ${l(`Tax${t!=null&&t.taxRate?` (${t.taxRate}%)`:""}`,m)}
                        ${c>0?l("Amount Paid",-c,"#16a34a"):""}
                        <tr><td colspan="2" style="border-top:1px solid #d1d5db;padding-top:12px;"></td></tr>
                        <tr>
                          <td style="font-size:17px;font-weight:900;text-transform:uppercase;color:#111827;">Total</td>
                          <td style="font-size:24px;font-weight:900;text-align:right;color:#0A4DFF;">${a(w)}</td>
                        </tr>
                        <tr>
                          <td style="padding-top:10px;font-size:15px;font-weight:900;text-transform:uppercase;color:#111827;">Balance Due</td>
                          <td style="padding-top:10px;font-size:20px;font-weight:900;text-align:right;color:#111827;">${a(P)}</td>
                        </tr>
                      </table>
                      ${d?`<a href="${r(d)}" style="display:block;margin-top:18px;padding:14px 16px;border-radius:12px;background:#0A4DFF;color:#ffffff;text-align:center;text-decoration:none;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:1px;">Pay Invoice</a>`:""}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,E=[`Invoice ${n} from ${p}`,`Date: ${z(e.createdAt)}`,`Status: ${$}`,`Payment Terms: ${v}`,`Due Date: ${f||"Due on receipt"}`,"",`Bill To: ${i(e.clientName||"Customer")}`,e.clientEmail?`Email: ${i(e.clientEmail)}`:"",e.clientPhone?`Phone: ${i(e.clientPhone)}`:"",`Service Location: ${i(N)}`,y.length?`Vehicle: ${y.map(S).join(", ")}`:`Vehicle: ${i(e.vehicleInfo||"Not recorded")}`,`Description: ${i(D(e.description))}`,"","Line Items:",...h.length?h.map(o=>`- ${i(o.serviceName||"Service")} x${o.quantity||1}: ${a(Number(o.total??(o.price||0)*(o.quantity||1)))}`):["- No line items recorded"],"",`Subtotal: ${a(g)}`,s>0?`Discount: -${a(s)}`:"",b>0?`${(t==null?void 0:t.serviceFeeLabel)||"Travel Fee"}: ${a(b)}`:"",u>0?`After-Hours Fee: ${a(u)}`:"",m>0?`Tax: ${a(m)}`:"",c>0?`Amount Paid: -${a(c)}`:"",`Total: ${a(w)}`,`Balance Due: ${a(P)}`,d?`Pay Invoice: ${d}`:"","","Thank you for your business."].filter(Boolean).join(`
`);return{html:L,text:E}}export{H as a,B as b};
