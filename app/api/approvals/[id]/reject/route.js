import { rejectReduction } from '../../../../../engine/reduction.js';
import { decideOnApproval } from '../../../../../utils/approvalApi.js';

/** `P-05` reject. Nothing moves, so `IT` can correct the date and resubmit. */
export async function POST(request, context) {
  return decideOnApproval(request, context, rejectReduction);
}
