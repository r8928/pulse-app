import { getCtoApplicationById } from '../../../../../database.js';
import { approveCtoApplication } from '../../../../../engine/cto.js';
import { decideOnCandidate } from '../../../../../utils/candidateApi.js';

/**
 * `P-01` (CTO), §22.1, `BR-26`. Both movements post or neither does. An
 * insufficient balance answers 400 naming the shortfall — the actor is
 * permitted, the state is not — and `override: true` proceeds, audited.
 */
export async function POST(request, context) {
  return decideOnCandidate(request, context, {
    load: getCtoApplicationById,
    decide: (id, body, actor) =>
      approveCtoApplication(
        id,
        { amount: body.amount, reason: body.reason, override: body.override },
        body.version,
        actor,
      ),
  });
}
