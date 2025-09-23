exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': 'https://license-me.co.uk',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'CORS preflight successful' })
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const formData = JSON.parse(event.body);
    console.log('Received booking data:', formData);

    const zapierUrl = 'https://hooks.zapier.com/hooks/catch/24659449/umey0fe/';

    const response = await fetch(zapierUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'License-Me-Booking-Webhook/1.0'
      },
      body: JSON.stringify(formData)
    });

    const zapierResponse = await response.text();
    
    if (response.ok) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          status: 'success',
          message: 'Booking processed successfully',
          zapier_response: zapierResponse
        })
      };
    } else {
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({
          error: 'Zapier request failed',
          status_code: response.status,
          response: zapierResponse
        })
      };
    }

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};
