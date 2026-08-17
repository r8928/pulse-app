import { getPtoAwardById } from '../../../../../database.js';
import { declinePtoAward } from '../../../../../engine/pto.js';
import { decideOnCandidate } from '../../../../../utils/candidateApi.js';

/** `P-03`, `FR-7.8`. Posts nothing, and states why. */
export async function POST(request, context) {
  return decideOnCandidate(request, context, {
    load: getPtoAwardById,
    decide: (id, body, actor) =>
      declinePtoAward(id, body.reason, body.version, actor),
  });
}
