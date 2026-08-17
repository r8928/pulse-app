import { listCtoApplications } from '../../../database.js';
import { listCandidates } from '../../../utils/candidateApi.js';

/** `S-15`'s CTO table. Gates on `pto.read` — CTO spends PTO (§22, `D-23`). */
export async function GET(request) {
  return listCandidates(request, { list: listCtoApplications });
}
