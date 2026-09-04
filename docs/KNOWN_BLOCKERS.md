# Known blockers outside the source repository

Resolved in GitHub:

- Repository creation and source publication are complete.
- `package-lock.json` is committed and verified with Node.js 24.
- `npm ci`, application checks, and the production Docker image build pass in GitHub Actions.

Remaining external gates:

1. **GCP Dammam account access**: a KSA-billed account must use the Google Cloud/CNTXT path before Terraform can provision `me-central2` resources.
2. **No connected GCP control-plane tool is available in this chat**: Cloud Run, Cloud SQL, Redis, Storage, regional Secret Manager, WIF, and IAM cannot be created from this session until a compatible GCP connection exists.
3. **SMS provider activation**: the native Unifonic adapter is implemented and tested, but staging still needs a real Unifonic account, AppSid, and registered Sender ID before it can be selected.
4. **Transactional email activation**: the native Resend adapter is implemented and tested, but staging still needs a verified sender domain/address and sending API key before it can be selected.
5. **Legacy source gap**: the original Vercel server source remains unavailable. Thiqah v1 is a clean rebuild based on the recovered product/API contract, not a claim that hidden legacy source was recovered.

The legacy Vercel production deployment remains untouched. Do not merge the staging foundation into a production release until the connected staging gates pass.
