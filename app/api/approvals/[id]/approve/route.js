import { approveReduction } from '../../../../../engine/reduction.js';
import { decideOnApproval } from '../../../../../utils/approvalApi.js';

/**
 * `P-05` approve. The stranded records are soft deleted and every ledger entry
 * they caused is reversed — never edited (`FR-2.4`, `NFR-9`).
 */
export async function POST(request, context) {
  return decideOnApproval(request, context, approveReduction);
}
