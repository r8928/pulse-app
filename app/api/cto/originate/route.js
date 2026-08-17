import { originateCtoApplication } from '../../../../engine/cto.js';
import { originateCandidate } from '../../../../utils/candidateApi.js';

/** `P-04` (CTO), `FR-7.7`. */
export async function POST(request) {
  return originateCandidate(request, { originate: originateCtoApplication });
}
