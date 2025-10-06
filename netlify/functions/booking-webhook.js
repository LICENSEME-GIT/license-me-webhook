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
        recordType: 'lead',
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

// Function to send confirmation email via Klaviyo using v3 API
async function sendKlaviyoEmail(formData) {
  try {
    const klaviyoPrivateKey = process.env.KLAVIYO_API_KEY;
    
    if (!klaviyoPrivateKey) {
      console.error('KLAVIYO_API_KEY not found in environment variables');
      return;
    }

    // Create or update profile first
    const profileData = {
      data: {
        type: 'profile',
        attributes: {
          email: formData.email,
          first_name: formData.firstName,
          last_name: formData.lastName,
          phone_number: formData.phone,
          properties: {
            booking_reference: formData.bookingReference,
            course_package: formData.package,
            course_location: formData.location
          }
        }
      }
    };

    // Create event to trigger the flow
    const eventData = {
      data: {
        type: 'event',
        attributes: {
          profile: {
            email: formData.email
          },
          metric: {
            name: 'Booking Confirmed'
          },
          properties: {
            booking_reference: formData.bookingReference,
            course_name: 'Door Supervisor Training',
            package: formData.package,
            location: formData.location,
            course_date: formData.courseDate,
            total_price: formData.totalPrice,
            efaw_required: formData.efawRequired,
            efaw_date: formData.efawDate || '',
            efaw_expiry_date: formData.efawExpiryDate || '',
            payment_id: formData.paymentId,
            first_name: formData.firstName,
            last_name: formData.lastName
          },
          time: new Date().toISOString()
        }
      }
    };

    // Send event to Klaviyo
    const eventResponse = await fetch('https://a.klaviyo.com/api/events/', {
      method: 'POST',
      headers: {
        'Authorization': `Klaviyo-API-Key ${klaviyoPrivateKey}`,
        'Content-Type': 'application/json',
        'revision': '2024-10-15'
      },
      body: JSON.stringify(eventData)
    });

    if (eventResponse.ok) {
      console.log('Klaviyo event sent successfully:', eventResponse.status);
    } else {
      const errorText = await eventResponse.text();
      console.error('Klaviyo event failed:', eventResponse.status, errorText);
    }

  } catch (error) {
    console.error('Klaviyo integration error:', error);
    // Don't fail the whole function if Klaviyo fails
  }
}
