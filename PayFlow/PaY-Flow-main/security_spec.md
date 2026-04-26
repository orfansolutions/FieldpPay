# Security Specification: Pay Flow (Hardened ABAC)

## Data Invariants
1. **Multi-Tenant Isolation**: Every resource (except public config and tax config) MUST belong to an `organisationId`. Users can only access resources where the `organisationId` matches their profile's `organisationId`.
2. **Subscription Integrity**: The `subscription` status on an Organisation can ONLY be updated by an Admin (Super User) or via a trusted server-side process. Even the `ownerUid` is forbidden from self-activating their subscription.
3. **Identity Verification**: No user can set their own `uid` or `organisationId` to something they do not belong to. `createdBy` and `ownerUid` must strictly match `request.auth.uid`.
4. **Terminal State Integrity**: Requisitions in 'Paid' or 'Approved' status cannot be updated except for specific state transitions by authorized roles.

## The "Dirty Dozen" Payloads (Security TDD)

| Attacker Goal | Target Path | Malicious Payload | Expected Result |
| :--- | :--- | :--- | :--- |
| **Pillar 1: Identity Spoofing** | `/users/hacker-id` | `{ "uid": "victim-id", "role": "Super User", ... }` | `PERMISSION_DENIED` |
| **Pillar 2: Subscription Bypass** | `/organisations/my-org` | `{ "subscription": { "status": "active" } }` | `PERMISSION_DENIED` |
| **Pillar 3: Multi-Tenant Breach** | `/requisitions/org-b-req` | Query by `organisationId: "my-org"` | `PERMISSION_DENIED` |
| **Pillar 4: State Skip** | `/requisitions/req-1` | `{ "status": "Paid" }` (from 'Draft') | `PERMISSION_DENIED` |
| **Pillar 5: Shadow Key Injection** | `/organisations/my-org` | `{ "name": "New Name", "isVerified": true }` | `PERMISSION_DENIED` |
| **Pillar 6: Resource Poisoning** | `/users/my-uid` | `{ "displayName": "A" * 2000 }` (2KB string) | `PERMISSION_DENIED` |
| **Pillar 7: orphan Record** | `/projects/id` | `{ "organisationId": "non-existent-org" }` | `PERMISSION_DENIED` |
| **Pillar 8: Privilege Escalation** | `/users/my-uid` | `{ "role": "Super User" }` | `PERMISSION_DENIED` |
| **Pillar 9: Unverified Admin** | Any | Access as `admin@org.com` with `email_verified: false` | `PERMISSION_DENIED` |
| **Pillar 10: Immutable Leak** | `/organisations/my-org` | `{ "ownerUid": "attacker-id" }` | `PERMISSION_DENIED` |
| **Pillar 11: Bulk Scrape** | `/users` | `getDocs(collection(db, 'users'))` (no filter) | `PERMISSION_DENIED` |
| **Pillar 12: Timestamp Spoofing** | `/requisitions/id` | `{ "updatedAt": "2020-01-01" }` (old date) | `PERMISSION_DENIED` |

## The Test Runner (Plan)
We will implement `firestore.rules` using the "Action-Based" Update Pattern and `affectedKeys().hasOnly()` gates to prevent these common vectors.
