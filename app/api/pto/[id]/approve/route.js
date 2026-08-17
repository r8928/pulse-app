import { getPtoAwardById } from '../../../../../database.js';
import { approvePtoAward } from '../../../../../engine/pto.js';
import { decideOnCandidate } from '../../../../../utils/candidateApi.js';

/**
 * `P-01`, `FR-7.2`. `amount` is unconstrained — the ladder decided what was
 * proposed, never what may be approved.
 */
export async function POST(request, context) {
  return decideOnCandidate(request, context, {
    load: getPtoAwardById,
    decide: (id, body, actor) =>
      approvePtoAward(
        id,
        { amount: body.amount, reason: body.reason },
        body.version,
        actor,
      ),
  });
}
