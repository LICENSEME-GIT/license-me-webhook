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

    // Determine if this is a payment update or initial form submission
    const isPaymentUpdate = formData.paymentId || formData.paymentStatus === 'completed';
    
    let zapierData;
    
    if (isPaymentUpdate) {
      // Payment completed - convert lead to contact
      zapierData = {
        ...formData,
        recordType: 'contact', // This will be a contact
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
        recordType: 'lead', // This will be a lead
        leadStatus: 'unpaid',
        paymentStatus: 'pending',
        customerStatus: 'awaiting_payment',
        lifecycle_stage: 'lead'
      };
    }

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

// Function to send confirmation email via Klaviyo
async function sendKlaviyoEmail(formData) {
  try {
    const klaviyoData = {
      token: process.env.KLAVIYO_API_KEY,
      event: 'Booking Confirmed',
      customer_properties: {
        email: formData.email,
        first_name: formData.firstName,
        last_name: formData.lastName,
        phone: formData.phone
      },
      properties: {
        booking_reference: formData.bookingReference,
        course_name: 'Door Supervisor Training',
        course_package: formData.package,
        course_location: formData.location,
        course_date: formData.courseDate,
        total_amount: formData.totalPrice,
        efaw_included: formData.efawRequired,
        efaw_date: formData.efawDate || '',
        payment_id: formData.paymentId
      }
    };

    const klaviyoResponse = await fetch('https://a.klaviyo.com/api/track', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(klaviyoData)
    });

    console.log('Klaviyo email triggered:', klaviyoResponse.status);
  } catch (error) {
    console.error('Klaviyo email failed:', error);
    // Don't fail the whole function if email fails
  }
}
