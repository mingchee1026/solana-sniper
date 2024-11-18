import {GetPriorityFeeEstimateResponse} from '../types/index';
import fetch from 'cross-fetch';

const HeliusURL = process.env.HELIUS_URL || '';

export async function getPriorityFeeEstimate(): Promise<GetPriorityFeeEstimateResponse> {
  try {
    const response = await fetch(HeliusURL, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: '1',
        method: 'getPriorityFeeEstimate',
        params: [
          {
            options: {
              // recommended: true,
              includeAllPriorityFeeLevels: true,
            },
          },
        ],
      }),
    });
    const data = await response.json();

    if ('error' in data) {
      throw new Error(JSON.stringify(data, null, 4));
    }

    return data.result;
  } catch (e) {
    const error = e as Error;
    console.log(`fetching priority estimates failed.\n${error.stack}`);
    return {};
  }
}
