import { getPtoAwardById } from '../../../../../database.js';
import { overridePtoExpiry } from '../../../../../engine/pto.js';
import { decideOnCandidate } from '../../../../../utils/candidateApi.js';

/** `P-27`, `FR-7.3`, `FR-6.10`. Reverses any posted `PTO_EXPIRY` first (`D-24`). */
export async function POST(request, context) {
  return decideOnCandidate(request, context, {
    load: getPtoAwardById,
    decide: (id, body, actor) =>
      overridePtoExpiry(
        id,
        { expiresAt: body.expiresAt, reason: body.reason },
        body.version,
        actor,
      ),
  });
}
