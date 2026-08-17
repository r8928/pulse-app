import { originatePtoAward } from '../../../../engine/pto.js';
import { originateCandidate } from '../../../../utils/candidateApi.js';

/** `P-04`, `FR-7.7`. A day the engine raised no suggestion for. */
export async function POST(request) {
  return originateCandidate(request, { originate: originatePtoAward });
}
