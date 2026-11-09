export async function onRequest(context) {
  const binding = context.env.WATERNOW_API;

  // The Pages project must call only the WaterNow Worker service binding.
  // There is deliberately no external Worker URL and no production fallback:
  // a missing or broken binding fails closed instead of reaching another app.
  if (!binding || typeof binding.fetch !== 'function') {
    return new Response(JSON.stringify({
      error: 'WaterNow API service binding is not configured.'
    }), {
      status: 503,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'private, no-store',
        'vary': 'Origin'
      }
    });
  }

  try {
    return await binding.fetch(context.request);
  } catch (error) {
    console.error('WaterNow API service binding request failed:', error?.message || error);
    return new Response(JSON.stringify({
      error: 'WaterNow API is temporarily unavailable.'
    }), {
      status: 503,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'private, no-store',
        'vary': 'Origin'
      }
    });
  }
}
