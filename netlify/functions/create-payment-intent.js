// netlify/functions/create-payment-intent.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event, context) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': 'https://license-me.co.uk',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'CORS preflight successful' })
    };
  }

  // Only accept POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { 
      amount, 
      currency, 
      bookingReference, 
      customerEmail,
      // NEW: Receive all customer details
      firstName,
      lastName,
      fullName,
      phone,
      fullAddress,
      location,
      courseDate,
      packageType,
      efawChoice,
      efawRequired,
      efawDate,
      totalPrice
    } = JSON.parse(event.body);

    // Create payment intent with COMPLETE metadata
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount, // Amount in pence/cents
      currency: currency,
      metadata: {
        // Booking reference
        booking_reference: bookingReference,
        
        // Customer details
        customer_email: customerEmail,
        first_name: firstName || '',
        last_name: lastName || '',
        full_name: fullName || '',
        phone: phone || '',
        full_address: fullAddress || '',
        
        // Course details
        course_location: location || '',
        course_date: courseDate || '',
        package: packageType || '',
        
        // EFAW details
        efaw_choice: efawChoice || '',
        efaw_required: efawRequired ? 'Yes' : 'No',
        efaw_date: efawDate || '',
        
        // Pricing
        total_price: totalPrice || '',
        base_price: (amount / 100).toFixed(2)
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        client_secret: paymentIntent.client_secret
      })
    };

  } catch (error) {
    console.error('Payment intent creation error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to create payment intent',
        message: error.message
      })
    };
  }
};
