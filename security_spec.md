# Firestore Security Specification: Protected Clients

## Data Invariants
- Only admins can read, create, update, or delete information in `protected_clients`.
- `protected_clients` contains sensitive risk management data, so it must be isolated from technicians and public users.

## Scope
- Path: `/protected_clients/{protectedClientId}`
- Operations: read, create, update, delete

## Security Rules
- `allow read, write: if isAdmin();`
