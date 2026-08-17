import { restoreReduction } from '../../../../../engine/reduction.js';
import { decideOnApproval } from '../../../../../utils/approvalApi.js';

/**
 * `FR-2.11`'s "`OFFICE_ADMIN` may restore them at any time afterwards, which
 * also reverses the reversing entries". The balance returns exactly.
 */
export async function POST(request, context) {
  return decideOnApproval(request, context, restoreReduction);
}
