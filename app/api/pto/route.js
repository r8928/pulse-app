import { listPtoAwards } from '../../../database.js';
import { listCandidates } from '../../../utils/candidateApi.js';

/** `S-15`'s PTO table. `FR-7.1`: a PENDING row has no ledger entry behind it. */
export async function GET(request) {
  return listCandidates(request, { list: listPtoAwards });
}
