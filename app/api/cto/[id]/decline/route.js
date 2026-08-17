import { getCtoApplicationById } from '../../../../../database.js';
import { declineCtoApplication } from '../../../../../engine/cto.js';
import { decideOnCandidate } from '../../../../../utils/candidateApi.js';

/** `P-03` (CTO). Posts nothing; the day's deduction stands. */
export async function POST(request, context) {
  return decideOnCandidate(request, context, {
    load: getCtoApplicationById,
    decide: (id, body, actor) =>
      declineCtoApplication(id, body.reason, body.version, actor),
  });
}
