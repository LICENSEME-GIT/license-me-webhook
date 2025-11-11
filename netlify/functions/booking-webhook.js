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
    console.log('Received booking data:', JSON.stringify(formData, null, 2));

    // Determine if this is a payment update or initial form submission
    const isPaymentUpdate = formData.paymentId || formData.paymentStatus === 'completed';
    
    // CRITICAL: Ensure email is always present
    if (!formData.email) {
      console.error('ERROR: Email field is missing from form data');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Email is required' })
      };
    }
    
    let zapierData;
    
    if (isPaymentUpdate) {
      // Payment completed - convert lead to contact
      zapierData = {
        ...formData,
        email: formData.email, // Explicitly include email
        recordType: 'contact',
        leadStatus: 'converted',
        paymentStatus: 'paid',
        customerStatus: 'paid_customer',
        contactType: 'customer',
        lifecycle_stage: 'customer'
      };
    } else {
      // Initial form submission - create as lead
      zapierData = {
        ...formData,
        email: formData.email, // Explicitly include email
        recordType: 'lead',
        leadStatus: 'unpaid',
        paymentStatus: 'pending',
        customerStatus: 'awaiting_payment',
        lifecycle_stage: 'lead'
      };
    }

    console.log('Sending to Zapier:', JSON.stringify(zapierData, null, 2));

    // Send to your Zapier webhook
    const zapierUrl = 'https://hooks.zapier.com/hooks/catch/24659449/umey0fe/';

    const response = await fetch(zapierUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'License-Me-Booking-Webhook/1.0'
      },
      body: JSON.stringify(zapierData)
    });

    const zapierResponse = await response.text();
    
    console.log('Zapier response:', {
      status: response.status,
      response: zapierResponse
    });

    if (response.ok) {
      // If payment was completed, also trigger Klaviyo email
      if (isPaymentUpdate && formData.paymentStatus === 'completed') {
        console.log('Triggering Klaviyo email for:', formData.email);
        await sendKlaviyoEmail(formData);
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          status: 'success',
          message: isPaymentUpdate ? 'Payment updated successfully' : 'Booking processed successfully',
          zapier_response: zapierResponse
        })
      };
    } else {
      console.error('Zapier request failed:', response.status, zapierResponse);
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
    console.error('Function error:', error);
    
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

// Function to send confirmation email via Klaviyo using Track API
async function sendKlaviyoEmail(formData) {
  try {
    const klaviyoPrivateKey = process.env.KLAVIYO_API_KEY;
    
    if (!klaviyoPrivateKey) {
      console.error('KLAVIYO_API_KEY not found in environment variables');
      return;
    }

    if (!formData.email) {
      console.error('Cannot send Klaviyo email: email is missing from formData');
      return;
    }

    console.log('Sending Klaviyo event for email:', formData.email);

    // Use simpler Track API format
    const trackData = {
      token: klaviyoPrivateKey,
      event: 'Placed Order',
      customer_properties: {
        $email: formData.email,
        $first_name: formData.firstName,
        $last_name: formData.lastName,
        $phone_number: formData.phone
      },
      properties: {
        booking_reference: formData.bookingReference,
        course_name: 'Door Supervisor Training',
        package: formData.package,
        location: formData.location,
        venue_name: formData.venueName || '',           // ⭐ ADDED
        venue_address: formData.venueAddress || '',     // ⭐ ADDED
        course_date: formData.courseDate,
        total_price: formData.totalPrice,
        efaw_required: formData.efawRequired,
        efaw_date: formData.efawDate || '',
        payment_id: formData.paymentId
      },
      time: Math.floor(Date.now() / 1000)
    };

    console.log('Klaviyo track data:', JSON.stringify(trackData, null, 2));

    // Send to Track API
    const eventResponse = await fetch('https://a.klaviyo.com/api/track', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(trackData)
    });

    const responseText = await eventResponse.text();
    
    if (eventResponse.ok || responseText === '1') {
      console.log('✅ Klaviyo event sent successfully');
    } else {
      console.error('❌ Klaviyo event failed:', eventResponse.status, responseText);
    }

  } catch (error) {
    console.error('❌ Klaviyo integration error:', error);
  }
}
