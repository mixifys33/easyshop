const nodemailer = require('nodemailer');
require('dotenv').config();

// Create transporter using Gmail SMTP
const transporter = nodemailer.createTransport({
  service: process.env.SMTP_SERVICE,
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: true, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Verify transporter configuration
transporter.verify((error, success) => {
  if (error) {
    console.log('Email transporter error:', error);
  } else {
    console.log('Email server is ready to send messages');
  }
});

// Generate OTP (4-digit for sellers, 6-digit for users)
const generateOTP = (digits = 4) => {
  const min = Math.pow(10, digits - 1);
  const max = Math.pow(10, digits) - 1;
  return Math.floor(min + Math.random() * (max - min + 1)).toString();
};

// Generate 6-digit OTP for users
const generateUserOTP = () => {
  return generateOTP(6);
};

// Send OTP email for users (6-digit) with user-focused design
const sendUserOTPEmail = async (email, name, otp, purpose = 'Account Verification') => {
  const isPasswordReset = purpose === 'Password Reset';
  
  const htmlTemplate = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${isPasswordReset ? 'Reset Your Password' : 'Welcome to EasyShop!'}</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                line-height: 1.6;
                color: #333;
                background-color: #f8fafc;
            }
            .container {
                max-width: 600px;
                margin: 0 auto;
                background-color: #ffffff;
                border-radius: 16px;
                overflow: hidden;
                box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            }
            .header {
                background: linear-gradient(135deg, ${isPasswordReset ? '#ef4444, #dc2626' : '#667eea, #764ba2'});
                padding: 40px 30px;
                text-align: center;
                color: white;
            }
            .header h1 {
                font-size: 32px;
                font-weight: bold;
                margin-bottom: 10px;
            }
            .header p {
                font-size: 18px;
                opacity: 0.9;
            }
            .logo {
                font-size: 48px;
                margin-bottom: 15px;
            }
            .content {
                padding: 40px 30px;
            }
            .greeting {
                font-size: 20px;
                margin-bottom: 25px;
                color: #1f2937;
            }
            .otp-section {
                background: linear-gradient(135deg, #f0f4ff, #e0e7ff);
                border-radius: 16px;
                padding: 35px;
                text-align: center;
                margin: 30px 0;
                border: 2px solid ${isPasswordReset ? '#ef4444' : '#667eea'};
            }
            .otp-title {
                font-size: 18px;
                color: #6b7280;
                margin-bottom: 20px;
                font-weight: 600;
            }
            .otp-code {
                font-size: 42px;
                font-weight: bold;
                color: ${isPasswordReset ? '#ef4444' : '#667eea'};
                letter-spacing: 12px;
                margin: 20px 0;
                font-family: 'Courier New', monospace;
                text-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .otp-validity {
                font-size: 16px;
                color: #ef4444;
                margin-top: 15px;
                font-weight: 600;
            }
            .welcome-section {
                background: linear-gradient(135deg, #10b981, #059669);
                color: white;
                padding: 30px;
                border-radius: 16px;
                margin: 30px 0;
                text-align: center;
            }
            .welcome-section h3 {
                font-size: 24px;
                margin-bottom: 15px;
            }
            .welcome-section p {
                font-size: 18px;
                opacity: 0.95;
            }
            .features {
                margin: 30px 0;
            }
            .features h3 {
                color: #1f2937;
                margin-bottom: 20px;
                font-size: 20px;
            }
            .feature-list {
                list-style: none;
            }
            .feature-list li {
                padding: 12px 0;
                padding-left: 35px;
                position: relative;
                color: #4b5563;
                font-size: 16px;
            }
            .feature-list li:before {
                content: "🛍️";
                position: absolute;
                left: 0;
                font-size: 18px;
            }
            .security-notice {
                background: #fef3c7;
                border: 2px solid #f59e0b;
                border-radius: 12px;
                padding: 25px;
                margin: 25px 0;
            }
            .security-notice h4 {
                color: #92400e;
                margin-bottom: 10px;
                font-size: 18px;
            }
            .security-notice p {
                color: #92400e;
                font-size: 16px;
            }
            .cta {
                background: linear-gradient(135deg, #f59e0b, #d97706);
                color: white;
                padding: 30px;
                border-radius: 16px;
                text-align: center;
                margin: 30px 0;
            }
            .cta h3 {
                font-size: 22px;
                margin-bottom: 15px;
            }
            .footer {
                background-color: #1f2937;
                color: white;
                padding: 35px 30px;
                text-align: center;
            }
            .footer p {
                margin-bottom: 10px;
                opacity: 0.8;
            }
            .footer .brand {
                font-size: 24px;
                font-weight: bold;
                margin-bottom: 15px;
            }
            @media (max-width: 600px) {
                .container {
                    margin: 10px;
                    border-radius: 12px;
                }
                .header, .content, .footer {
                    padding: 25px 20px;
                }
                .otp-code {
                    font-size: 32px;
                    letter-spacing: 8px;
                }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo">🛍️</div>
                <h1>EasyShop</h1>
                <p>${isPasswordReset ? 'Secure Password Reset' : 'Welcome to Your Shopping Journey!'}</p>
            </div>
            
            <div class="content">
                <div class="greeting">
                    Hello ${name || 'Valued Customer'}! 👋
                </div>
                
                ${isPasswordReset ? `
                <p>We received a request to reset your password for your EasyShop account. Use the verification code below to create a new password and regain access to your account.</p>
                ` : `
                <p>Welcome to <strong>EasyShop</strong> - your gateway to amazing products and great deals! We're excited to have you join our community of happy shoppers.</p>
                `}
                
                <div class="otp-section">
                    <div class="otp-title">${isPasswordReset ? 'Password Reset Code' : 'Your Verification Code'}</div>
                    <div class="otp-code">${otp}</div>
                    <div class="otp-validity">⏰ Valid for 10 minutes</div>
                </div>
                
                ${isPasswordReset ? `
                <div class="security-notice">
                    <h4>🔒 Security Notice</h4>
                    <p>If you didn't request a password reset, please ignore this email and your password will remain unchanged. For your security, this code will expire in 10 minutes.</p>
                </div>
                ` : `
                <div class="welcome-section">
                    <h3>🎉 Welcome to EasyShop!</h3>
                    <p>You're about to discover amazing products, great deals, and a seamless shopping experience!</p>
                </div>
                
                <div class="features">
                    <h3>What You'll Love About EasyShop:</h3>
                    <ul class="feature-list">
                        <li>Thousands of quality products at great prices</li>
                        <li>Fast and secure checkout process</li>
                        <li>Multiple payment options for your convenience</li>
                        <li>Quick delivery right to your doorstep</li>
                        <li>24/7 customer support when you need help</li>
                        <li>Exclusive deals and discounts for members</li>
                    </ul>
                </div>
                
                <div class="cta">
                    <h3>🛒 Ready to Start Shopping?</h3>
                    <p>Complete your verification and explore thousands of amazing products waiting for you!</p>
                </div>
                `}
                
                <p><strong>Important:</strong> If you didn't request this ${isPasswordReset ? 'password reset' : 'account creation'}, please ignore this email. Your account security is our top priority.</p>
                
                <p>Need help? Our friendly customer support team is here for you 24/7.</p>
            </div>
            
            <div class="footer">
                <div class="brand">🛍️ EasyShop</div>
                <p>Your Trusted Shopping Partner</p>
                <p>📧 support@easyshop.com | 📞 Customer Support</p>
               
                <p style="margin-top: 25px; font-size: 14px; opacity: 0.6;">
                    © 2024 EasyShop. All rights reserved.<br>
                    This email was sent to ${email}
                </p>
            </div>
        </div>
    </body>
    </html>
  `;

  const mailOptions = {
    from: {
      name: 'EasyShop',
      address: process.env.SMTP_USER
    },
    to: email,
    subject: isPasswordReset ? 
      '🔐 Reset Your EasyShop Password - Secure Access Code' : 
      '🛍️ Welcome to EasyShop - Verify Your Account!',
    html: htmlTemplate,
    text: `
Hello ${name || (isPasswordReset ? 'Valued Customer' : 'New Shopper')}!

${isPasswordReset ? 
  `We received a request to reset your password for your EasyShop account.` :
  `Welcome to EasyShop! We're excited to have you join our community of happy shoppers.`
}

Your ${isPasswordReset ? 'password reset' : 'verification'} code is: ${otp}

This code is valid for 10 minutes. ${isPasswordReset ? 
  'Enter it to reset your password.' : 
  'Enter it to complete your account setup and start shopping!'
}

${isPasswordReset ? 
  `If you didn't request a password reset, please ignore this email.` :
  `You're about to discover:
- Thousands of quality products at great prices
- Fast and secure checkout process
- Multiple payment options
- Quick delivery to your doorstep
- 24/7 customer support
- Exclusive deals and discounts`
}

Need help? Contact our customer support team.

Happy Shopping!
The EasyShop Team
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`User ${purpose} email sent successfully:`, info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`Error sending user ${purpose} email:`, error);
    return { success: false, error: error.message };
  }
};
const sendOTPEmail = async (email, name, otp, purpose = 'Account Verification') => {
  const isPasswordReset = purpose === 'Password Reset';
  
  const htmlTemplate = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${isPasswordReset ? 'Reset Your Password' : 'Verify Your AllOut Gadgets Seller Account'}</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                line-height: 1.6;
                color: #333;
                background-color: #f8f9fa;
            }
            .container {
                max-width: 600px;
                margin: 0 auto;
                background-color: #ffffff;
                border-radius: 12px;
                overflow: hidden;
                box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            }
            .header {
                background: linear-gradient(135deg, ${isPasswordReset ? '#e74c3c, #c0392b' : '#3498db, #2980b9'});
                padding: 40px 30px;
                text-align: center;
                color: white;
            }
            .header h1 {
                font-size: 28px;
                font-weight: bold;
                margin-bottom: 10px;
            }
            .header p {
                font-size: 16px;
                opacity: 0.9;
            }
            .content {
                padding: 40px 30px;
            }
            .greeting {
                font-size: 18px;
                margin-bottom: 20px;
                color: #2c3e50;
            }
            .otp-section {
                background: linear-gradient(135deg, #f8f9fa, #e9ecef);
                border-radius: 12px;
                padding: 30px;
                text-align: center;
                margin: 30px 0;
                border-left: 5px solid ${isPasswordReset ? '#e74c3c' : '#3498db'};
            }
            .otp-title {
                font-size: 16px;
                color: #666;
                margin-bottom: 15px;
            }
            .otp-code {
                font-size: 36px;
                font-weight: bold;
                color: ${isPasswordReset ? '#e74c3c' : '#3498db'};
                letter-spacing: 8px;
                margin: 15px 0;
                font-family: 'Courier New', monospace;
            }
            .otp-validity {
                font-size: 14px;
                color: #e74c3c;
                margin-top: 10px;
            }
            .motivation {
                background: linear-gradient(135deg, ${isPasswordReset ? '#f39c12, #e67e22' : '#27ae60, #2ecc71'});
                color: white;
                padding: 25px;
                border-radius: 12px;
                margin: 30px 0;
                text-align: center;
            }
            .motivation h3 {
                font-size: 20px;
                margin-bottom: 10px;
            }
            .motivation p {
                font-size: 16px;
                opacity: 0.95;
            }
            .features {
                margin: 30px 0;
            }
            .features h3 {
                color: #2c3e50;
                margin-bottom: 20px;
                font-size: 18px;
            }
            .feature-list {
                list-style: none;
            }
            .feature-list li {
                padding: 8px 0;
                padding-left: 25px;
                position: relative;
                color: #555;
            }
            .feature-list li:before {
                content: "✅";
                position: absolute;
                left: 0;
            }
            .security-notice {
                background: #fff3cd;
                border: 1px solid #ffeaa7;
                border-radius: 8px;
                padding: 20px;
                margin: 20px 0;
            }
            .security-notice h4 {
                color: #856404;
                margin-bottom: 10px;
            }
            .security-notice p {
                color: #856404;
                font-size: 14px;
            }
            .cta {
                background: linear-gradient(135deg, #f39c12, #e67e22);
                color: white;
                padding: 25px;
                border-radius: 12px;
                text-align: center;
                margin: 30px 0;
            }
            .cta h3 {
                font-size: 18px;
                margin-bottom: 10px;
            }
            .footer {
                background-color: #2c3e50;
                color: white;
                padding: 30px;
                text-align: center;
            }
            .footer p {
                margin-bottom: 10px;
                opacity: 0.8;
            }
            .social-links {
                margin-top: 20px;
            }
            .social-links a {
                color: #3498db;
                text-decoration: none;
                margin: 0 10px;
            }
            @media (max-width: 600px) {
                .container {
                    margin: 10px;
                    border-radius: 8px;
                }
                .header, .content, .footer {
                    padding: 20px;
                }
                .otp-code {
                    font-size: 28px;
                    letter-spacing: 4px;
                }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>${isPasswordReset ? '🔐' : '🏪'} AllOut Gadgets</h1>
                <p>${isPasswordReset ? 'Secure Password Reset' : 'Your Journey to Successful trading Starts Here'}</p>
            </div>
            
            <div class="content">
                <div class="greeting">
                    Hello ${name || 'Valued Seller'}! 👋
                </div>
                
                ${isPasswordReset ? `
                <p>We received a request to reset your password for your AllOutGadgets seller account. Use the verification code below to proceed with resetting your password.</p>
                ` : `
                <p>Welcome to <strong>AllOutGadgets</strong> - where businesses become profitable realities! We're thrilled that you've chosen to start your entrepreneurial journey with us.</p>
                `}
                
                <div class="otp-section">
                    <div class="otp-title">${isPasswordReset ? 'Password Reset Code' : 'Your Verification Code'}</div>
                    <div class="otp-code">${otp}</div>
                    <div class="otp-validity">⏰ Valid for 10 minutes</div>
                </div>
                
                ${isPasswordReset ? `
                <div class="security-notice">
                    <h4>🔒 Security Notice</h4>
                    <p>If you didn't request a password reset, please ignore this email and your password will remain unchanged. For your security, this code will expire in 10 minutes.</p>
                </div>
                ` : `
                <div class="motivation">
                    <h3>🚀 You're About to Join Something Amazing!</h3>
                    <p>Thousands of sellers are already building their empires with us. Your success story starts today!</p>
                </div>
                
                <div class="features">
                    <h3>What Awaits You:</h3>
                    <ul class="feature-list">
                        <li>Reach millions of customers across Uganda and beyond</li>
                        <li>Easy-to-use seller dashboard with powerful analytics</li>
                        <li>Multiple payment options including Mobile Money</li>
                        <li>24/7 seller support to help you succeed</li>
                        <li>Marketing tools to boost your sales</li>
                        <li>Secure and fast payment processing</li>
                    </ul>
                </div>
                
                <div class="cta">
                    <h3>💰 Ready to Start Earning?</h3>
                    <p>Complete your verification and set up your shop in the next few minutes. Your first sale could be just hours away!</p>
                </div>
                `}
                
                <p><strong>Important:</strong> If you didn't request this ${isPasswordReset ? 'password reset' : 'verification'}, please ignore this email. Your account security is our priority.</p>
                
                <p>Need help? Our support team is here for you 24/7.</p>
            </div>
            
            <div class="footer">
                <p><strong>AllOutGadgets</strong> - Empowering Entrepreneurs</p>
                <p>📧 support@alloutgadgets.com | 📞 +256761819885</p>
               
                <p style="margin-top: 20px; font-size: 12px; opacity: 0.6;">
                    © 2024 AllOutGadgets. All rights reserved.<br>
                    This email was sent to ${email}
                </p>
            </div>
        </div>
    </body>
    </html>
  `;

  const mailOptions = {
    from: {
      name: 'AllOutGadgets',
      address: process.env.SMTP_USER
    },
    to: email,
    subject: isPasswordReset ? 
      '🔐 Reset Your AllOutGadgets Password - Secure Access Code' : 
      '🔐 Verify Your AllOutGadgets Seller Account - Your Success Journey Begins!',
    html: htmlTemplate,
    text: `
Hello ${name || (isPasswordReset ? 'Valued Seller' : 'Future Entrepreneur')}!

${isPasswordReset ? 
  `We received a request to reset your password for your AllOutGadgets seller account.` :
  `Welcome to AllOutGadgets! `
}

Your ${isPasswordReset ? 'password reset' : 'verification'} code is: ${otp}

This code is valid for 10 minutes. ${isPasswordReset ? 
  'Enter it to reset your password.' : 
  'Enter it to complete your seller account setup.'
}

${isPasswordReset ? 
  `If you didn't request a password reset, please ignore this email.` :
  `You're about to join thousands of successful sellers who are building their empires with us!

What awaits you:
- Reach millions of customers
- Easy-to-use seller dashboard
- Multiple payment options
- 24/7 seller support
- Marketing tools to boost sales`
}

Need help? Contact us by replying to the email. 

Best regards,
The AllOutGadgets Team
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`${purpose} email sent successfully:`, info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`Error sending ${purpose} email:`, error);
    return { success: false, error: error.message };
  }
};

// Send welcome email for users after successful verification
const sendUserWelcomeEmail = async (email, name) => {
  const htmlTemplate = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to EasyShop!</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background-color: #f8fafc; }
            .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #10b981, #059669); padding: 40px 30px; text-align: center; color: white; }
            .header h1 { font-size: 36px; font-weight: bold; margin-bottom: 10px; }
            .logo { font-size: 48px; margin-bottom: 15px; }
            .content { padding: 40px 30px; }
            .success-badge { background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 25px; border-radius: 16px; text-align: center; margin: 25px 0; }
            .next-steps { background: #f0f4ff; padding: 30px; border-radius: 16px; margin: 30px 0; border: 2px solid #667eea; }
            .step { padding: 18px 0; border-bottom: 1px solid #e5e7eb; }
            .step:last-child { border-bottom: none; }
            .step-number { background: #667eea; color: white; width: 35px; height: 35px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-right: 20px; font-weight: bold; font-size: 16px; }
            .footer { background-color: #1f2937; color: white; padding: 35px 30px; text-align: center; }
            .footer .brand { font-size: 24px; font-weight: bold; margin-bottom: 15px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo">🛍️</div>
                <h1>Welcome to EasyShop!</h1>
                <p>Your account is now active and ready</p>
            </div>
            
            <div class="content">
                <h2>Congratulations, ${name}! 🎉</h2>
                <p>Your EasyShop account has been successfully verified and activated. You're now part of our amazing shopping community!</p>
                
                <div class="success-badge">
                    <h3>✅ Account Verified Successfully</h3>
                    <p>You can now start shopping and enjoying great deals!</p>
                </div>
                
                <div class="next-steps">
                    <h3>🛒 Start Your Shopping Journey:</h3>
                    <div class="step">
                        <span class="step-number">1</span>
                        <strong>Browse Products</strong> - Explore thousands of amazing products in all categories
                    </div>
                    <div class="step">
                        <span class="step-number">2</span>
                        <strong>Add to Cart</strong> - Find something you love? Add it to your cart with one click
                    </div>
                    <div class="step">
                        <span class="step-number">3</span>
                        <strong>Secure Checkout</strong> - Pay safely with multiple payment options
                    </div>
                    <div class="step">
                        <span class="step-number">4</span>
                        <strong>Fast Delivery</strong> - Sit back and wait for your order to arrive at your doorstep
                    </div>
                </div>
                
                <p><strong>Pro Tip:</strong> Check out our daily deals and exclusive member discounts for the best savings!</p>
                
                <div style="background: linear-gradient(135deg, #f59e0b, #d97706); color: white; padding: 25px; border-radius: 16px; text-align: center; margin: 25px 0;">
                    <h3>🎁 Special Welcome Offer</h3>
                    <p>Get 10% off your first order with code: <strong>WELCOME10</strong></p>
                </div>
            </div>
            
            <div class="footer">
                <div class="brand">🛍️ EasyShop</div>
                <p><strong>Ready to start shopping?</strong></p>
                <p>Login to your account and discover amazing deals!</p>
                <p style="margin-top: 20px;">📧 support@easyshop.com | 📞 Customer Support</p>
            </div>
        </div>
    </body>
    </html>
  `;

  const mailOptions = {
    from: {
      name: 'EasyShop',
      address: process.env.SMTP_USER
    },
    to: email,
    subject: '🎉 Welcome to EasyShop - Your Shopping Journey Begins!',
    html: htmlTemplate
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('User welcome email sent successfully:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending user welcome email:', error);
    return { success: false, error: error.message };
  }
};
const sendWelcomeEmail = async (email, name) => {
  const htmlTemplate = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to AllOut Gadgets!</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background-color: #f8f9fa; }
            .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #27ae60, #2ecc71); padding: 40px 30px; text-align: center; color: white; }
            .header h1 { font-size: 32px; font-weight: bold; margin-bottom: 10px; }
            .content { padding: 40px 30px; }
            .success-badge { background: linear-gradient(135deg, #f39c12, #e67e22); color: white; padding: 20px; border-radius: 12px; text-align: center; margin: 20px 0; }
            .next-steps { background: #f8f9fa; padding: 25px; border-radius: 12px; margin: 25px 0; }
            .step { padding: 15px 0; border-bottom: 1px solid #eee; }
            .step:last-child { border-bottom: none; }
            .step-number { background: #3498db; color: white; width: 30px; height: 30px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-right: 15px; font-weight: bold; }
            .footer { background-color: #2c3e50; color: white; padding: 30px; text-align: center; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🎉 Welcome to AllOutGadgets!</h1>
                <p>Your seller account is now active</p>
            </div>
            
            <div class="content">
                <h2>Congratulations, ${name}! 🚀</h2>
                <p>Your seller account has been successfully verified and activated. You're now part of the AllOutGadgets family!</p>
                
                <div class="success-badge">
                    <h3>✅ Account Verified Successfully</h3>
                    <p>You can now start selling and earning money!</p>
                </div>
                
                <div class="next-steps">
                    <h3>🎯 Next Steps to Success:</h3>
                    <div class="step">
                        <span class="step-number">1</span>
                        <strong>Complete Your Shop Setup</strong> - Add your shop details, logo, and description
                    </div>
                    <div class="step">
                        <span class="step-number">2</span>
                        <strong>Connect Payment Method</strong> - Set up Mobile Money, bank account, or other payment options
                    </div>
                    <div class="step">
                        <span class="step-number">3</span>
                        <strong>Add Your First Products</strong> - Upload products with great photos and descriptions
                    </div>
                    <div class="step">
                        <span class="step-number">4</span>
                        <strong>Start Selling!</strong> - Share your shop and watch the orders come in
                    </div>
                </div>
                
                <p><strong>Pro Tip:</strong> Sellers who complete their setup within 24 hours see 3x more sales in their first week!</p>
            </div>
            
            <div class="footer">
                <p><strong>Ready to start your success story?</strong></p>
                <p>Login to your seller dashboard and begin your journey!</p>
                <p style="margin-top: 20px;">📧 support@alloutgadgets.com | 📞 +256761819885</p>
            </div>
        </div>
    </body>
    </html>
  `;

  const mailOptions = {
    from: {
      name: 'AllOut Gadgets',
      address: process.env.SMTP_USER
    },
    to: email,
    subject: '🎉 Welcome to AllOut Gadgets - Your Success Journey Begins Now!',
    html: htmlTemplate
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Welcome email sent successfully:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending welcome email:', error);
    return { success: false, error: error.message };
  }
};

// ─── ORDER CONFIRMATION EMAIL (to buyer) ────────────────────────────────────
const sendOrderConfirmationToUser = async (email, userName, order) => {
  const orderId = `#${order._id.toString().slice(-6).toUpperCase()}`;
  const total = (order.subtotal || 0) + (order.deliveryFee || 0);
  const itemsHtml = (order.items || []).map(i => `
    <tr>
      <td style="padding:10px;border-bottom:1px solid #f0f0f0;">
        ${i.image ? `<img src="${i.image}" width="60" height="60" style="border-radius:8px;object-fit:cover;" />` : ''}
      </td>
      <td style="padding:10px;border-bottom:1px solid #f0f0f0;">
        <strong>${i.name}</strong><br/>
        <span style="color:#888;font-size:13px;">Qty: ${i.quantity}</span>
      </td>
      <td style="padding:10px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:700;color:#27ae60;">
        UGX ${((i.price || 0) * (i.quantity || 1)).toLocaleString()}
      </td>
    </tr>`).join('');

  const proofHtml = (order.proofImages || []).map(p =>
    `<img src="${p.url}" style="width:140px;height:100px;object-fit:cover;border-radius:8px;margin:4px;" />`
  ).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head><body style="font-family:'Segoe UI',sans-serif;background:#f4f6f8;margin:0;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#27ae60,#2ecc71);padding:36px 30px;text-align:center;color:#fff;">
      <div style="font-size:48px;">🛍️</div>
      <h1 style="margin:10px 0 4px;">Order Confirmed!</h1>
      <p style="opacity:.9;font-size:16px;">Thank you for shopping with EasyShop</p>
    </div>
    <div style="padding:30px;">
      <p style="font-size:16px;color:#333;">Hi <strong>${userName || 'Valued Customer'}</strong> 👋</p>
      <p style="color:#555;">Your order has been placed successfully. Here are your order details:</p>

      <div style="background:#f8f9fa;border-radius:12px;padding:16px;margin:20px 0;border-left:4px solid #27ae60;">
        <p style="margin:0 0 6px;"><strong>Order ID:</strong> ${orderId}</p>
        <p style="margin:0 0 6px;"><strong>Payment Method:</strong> ${order.paymentMethod?.toUpperCase() || 'N/A'}</p>
        <p style="margin:0 0 6px;"><strong>Delivery:</strong> ${order.delivery?.name || 'N/A'} (${order.delivery?.estimatedDays || '?'} days)</p>
        <p style="margin:0;"><strong>Status:</strong> <span style="color:#9b59b6;font-weight:700;">Pending</span></p>
      </div>

      <h3 style="color:#333;margin-bottom:12px;">Items Ordered</h3>
      <table style="width:100%;border-collapse:collapse;">${itemsHtml}</table>

      <div style="background:#f0faf4;border-radius:10px;padding:16px;margin-top:16px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
          <span style="color:#666;">Subtotal</span><span>UGX ${(order.subtotal || 0).toLocaleString()}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
          <span style="color:#666;">Delivery Fee</span><span>UGX ${(order.deliveryFee || 0).toLocaleString()}</span>
        </div>
        <div style="display:flex;justify-content:space-between;border-top:1px solid #d5f0e0;padding-top:10px;margin-top:6px;">
          <strong style="font-size:16px;">Total</strong><strong style="font-size:16px;color:#27ae60;">UGX ${total.toLocaleString()}</strong>
        </div>
      </div>

      ${proofHtml ? `<div style="margin-top:20px;"><h3 style="color:#333;margin-bottom:10px;">Payment Proof Submitted</h3><div>${proofHtml}</div></div>` : ''}

      <div style="background:#fff3cd;border-radius:10px;padding:16px;margin-top:20px;border-left:4px solid #f39c12;">
        <p style="margin:0;color:#856404;font-size:14px;">📦 Your order is being reviewed by the seller. You'll receive updates as it progresses.</p>
      </div>
    </div>
    <div style="background:#1f2937;color:#fff;padding:24px;text-align:center;">
      <p style="font-size:18px;font-weight:700;margin-bottom:6px;">🛍️ EasyShop</p>
      <p style="opacity:.7;font-size:13px;">© 2024 EasyShop. All rights reserved.</p>
    </div>
  </div></body></html>`;

  try {
    const info = await transporter.sendMail({
      from: { name: 'EasyShop', address: process.env.SMTP_USER },
      to: email,
      subject: `✅ Order Confirmed ${orderId} — EasyShop`,
      html,
    });
    console.log('[email] Order confirmation sent to user:', info.messageId);
    return { success: true };
  } catch (e) {
    console.error('[email] Failed to send order confirmation to user:', e.message);
    return { success: false, error: e.message };
  }
};

// ─── NEW ORDER NOTIFICATION EMAIL (to seller) ────────────────────────────────
const sendNewOrderToSeller = async (sellerEmail, sellerName, order, buyerName) => {
  const orderId = `#${order._id.toString().slice(-6).toUpperCase()}`;
  const total = (order.subtotal || 0) + (order.deliveryFee || 0);
  const itemsHtml = (order.items || []).map(i => `
    <tr>
      <td style="padding:10px;border-bottom:1px solid #f0f0f0;">
        ${i.image ? `<img src="${i.image}" width="60" height="60" style="border-radius:8px;object-fit:cover;" />` : ''}
      </td>
      <td style="padding:10px;border-bottom:1px solid #f0f0f0;">
        <strong>${i.name}</strong><br/>
        <span style="color:#888;font-size:13px;">Qty: ${i.quantity} × UGX ${(i.price || 0).toLocaleString()}</span>
      </td>
      <td style="padding:10px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:700;color:#3498db;">
        UGX ${((i.price || 0) * (i.quantity || 1)).toLocaleString()}
      </td>
    </tr>`).join('');

  const proofHtml = (order.proofImages || []).map(p =>
    `<img src="${p.url}" style="width:140px;height:100px;object-fit:cover;border-radius:8px;margin:4px;" />`
  ).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head><body style="font-family:'Segoe UI',sans-serif;background:#f4f6f8;margin:0;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#3498db,#2980b9);padding:36px 30px;text-align:center;color:#fff;">
      <div style="font-size:48px;">🔔</div>
      <h1 style="margin:10px 0 4px;">New Order Received!</h1>
      <p style="opacity:.9;font-size:16px;">You have a new order to fulfill</p>
    </div>
    <div style="padding:30px;">
      <p style="font-size:16px;color:#333;">Hi <strong>${sellerName || 'Seller'}</strong> 👋</p>
      <p style="color:#555;">Great news! A customer has placed an order from your shop. Please review and process it promptly.</p>

      <div style="background:#ebf5fb;border-radius:12px;padding:16px;margin:20px 0;border-left:4px solid #3498db;">
        <p style="margin:0 0 6px;"><strong>Order ID:</strong> ${orderId}</p>
        <p style="margin:0 0 6px;"><strong>Customer:</strong> ${buyerName || order.buyerInfo?.name || order.customerInfo?.fullName || 'N/A'}</p>
        <p style="margin:0 0 6px;"><strong>Phone:</strong> ${order.buyerInfo?.phone || order.customerInfo?.phone || 'N/A'}</p>
        <p style="margin:0 0 6px;"><strong>Payment Method:</strong> ${order.paymentMethod?.toUpperCase() || 'N/A'}</p>
        <p style="margin:0 0 6px;"><strong>Delivery:</strong> ${order.delivery?.name || 'N/A'} (${order.delivery?.estimatedDays || '?'} days)</p>
        ${order.customerInfo?.address ? `<p style="margin:0;"><strong>Address:</strong> ${order.customerInfo.address}, ${order.customerInfo.city || ''}</p>` : ''}
        ${order.customerInfo?.notes ? `<p style="margin:6px 0 0;"><strong>Notes:</strong> ${order.customerInfo.notes}</p>` : ''}
      </div>

      <h3 style="color:#333;margin-bottom:12px;">Items to Fulfill</h3>
      <table style="width:100%;border-collapse:collapse;">${itemsHtml}</table>

      <div style="background:#ebf5fb;border-radius:10px;padding:16px;margin-top:16px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
          <span style="color:#666;">Subtotal</span><span>UGX ${(order.subtotal || 0).toLocaleString()}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
          <span style="color:#666;">Delivery Fee</span><span>UGX ${(order.deliveryFee || 0).toLocaleString()}</span>
        </div>
        <div style="display:flex;justify-content:space-between;border-top:1px solid #aed6f1;padding-top:10px;margin-top:6px;">
          <strong style="font-size:16px;">Total</strong><strong style="font-size:16px;color:#3498db;">UGX ${total.toLocaleString()}</strong>
        </div>
      </div>

      ${proofHtml ? `<div style="margin-top:20px;"><h3 style="color:#333;margin-bottom:10px;">Payment Proof from Customer</h3><div>${proofHtml}</div></div>` : ''}

      <div style="background:#d5f5e3;border-radius:10px;padding:16px;margin-top:20px;border-left:4px solid #27ae60;">
        <p style="margin:0;color:#1e8449;font-size:14px;font-weight:600;">⚡ Action Required: Please process this order and update its status in your seller dashboard.</p>
      </div>
    </div>
    <div style="background:#1f2937;color:#fff;padding:24px;text-align:center;">
      <p style="font-size:18px;font-weight:700;margin-bottom:6px;">🏪 EasyShop Seller Portal</p>
      <p style="opacity:.7;font-size:13px;">© 2024 EasyShop. All rights reserved.</p>
    </div>
  </div></body></html>`;

  try {
    const info = await transporter.sendMail({
      from: { name: 'EasyShop Orders', address: process.env.SMTP_USER },
      to: sellerEmail,
      subject: `🔔 New Order ${orderId} — Action Required`,
      html,
    });
    console.log('[email] New order notification sent to seller:', info.messageId);
    return { success: true };
  } catch (e) {
    console.error('[email] Failed to send new order to seller:', e.message);
    return { success: false, error: e.message };
  }
};

// ─── ORDER CANCELLATION / REFUND EMAIL (to seller) ───────────────────────────
const sendCancellationToSeller = async (sellerEmail, sellerName, order, buyerName, buyerEmail) => {
  const orderId = `#${order._id.toString().slice(-6).toUpperCase()}`;
  const total = (order.subtotal || 0) + (order.deliveryFee || 0);
  const itemsHtml = (order.items || []).map(i => `
    <tr>
      <td style="padding:10px;border-bottom:1px solid #f0f0f0;"><strong>${i.name}</strong></td>
      <td style="padding:10px;border-bottom:1px solid #f0f0f0;text-align:center;">${i.quantity}</td>
      <td style="padding:10px;border-bottom:1px solid #f0f0f0;text-align:right;">UGX ${((i.price || 0) * (i.quantity || 1)).toLocaleString()}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head><body style="font-family:'Segoe UI',sans-serif;background:#f4f6f8;margin:0;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#e74c3c,#c0392b);padding:36px 30px;text-align:center;color:#fff;">
      <div style="font-size:48px;">❌</div>
      <h1 style="margin:10px 0 4px;">Order Cancelled</h1>
      <p style="opacity:.9;font-size:16px;">A customer has cancelled their order — refund required</p>
    </div>
    <div style="padding:30px;">
      <p style="font-size:16px;color:#333;">Hi <strong>${sellerName || 'Seller'}</strong>,</p>
      <p style="color:#555;">The following order has been cancelled by the customer. Please initiate the refund process as soon as possible.</p>

      <div style="background:#fdecea;border-radius:12px;padding:16px;margin:20px 0;border-left:4px solid #e74c3c;">
        <p style="margin:0 0 6px;"><strong>Order ID:</strong> ${orderId}</p>
        <p style="margin:0 0 6px;"><strong>Customer Name:</strong> ${buyerName || order.buyerInfo?.name || order.customerInfo?.fullName || 'N/A'}</p>
        <p style="margin:0 0 6px;"><strong>Customer Email:</strong> ${buyerEmail || order.buyerInfo?.email || 'N/A'}</p>
        <p style="margin:0 0 6px;"><strong>Customer Phone:</strong> ${order.buyerInfo?.phone || order.customerInfo?.phone || 'N/A'}</p>
        <p style="margin:0 0 6px;"><strong>Payment Method:</strong> ${order.paymentMethod?.toUpperCase() || 'N/A'}</p>
        <p style="margin:0;"><strong>Amount to Refund:</strong> <span style="color:#e74c3c;font-weight:700;font-size:16px;">UGX ${total.toLocaleString()}</span></p>
      </div>

      <h3 style="color:#333;margin-bottom:12px;">Cancelled Items</h3>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="background:#f8f9fa;">
          <th style="padding:10px;text-align:left;">Item</th>
          <th style="padding:10px;text-align:center;">Qty</th>
          <th style="padding:10px;text-align:right;">Amount</th>
        </tr></thead>
        <tbody>${itemsHtml}</tbody>
      </table>

      <div style="background:#fff3cd;border-radius:12px;padding:20px;margin-top:20px;border-left:4px solid #f39c12;">
        <h3 style="color:#856404;margin-bottom:12px;">⚠️ Refund Process — Action Required</h3>
        <ol style="color:#856404;padding-left:20px;line-height:2;">
          <li>Contact the customer at <strong>${buyerEmail || order.buyerInfo?.email || 'N/A'}</strong> or <strong>${order.buyerInfo?.phone || order.customerInfo?.phone || 'N/A'}</strong></li>
          <li>Confirm the payment amount received: <strong>UGX ${total.toLocaleString()}</strong></li>
          <li>Initiate the refund via the same payment method used: <strong>${order.paymentMethod?.toUpperCase() || 'N/A'}</strong></li>
          <li>Complete the refund within <strong>3–5 business days</strong></li>
          <li>Notify the customer once the refund has been sent</li>
        </ol>
      </div>

      <p style="color:#888;font-size:13px;margin-top:20px;">If you have any questions about this cancellation, please contact EasyShop support.</p>
    </div>
    <div style="background:#1f2937;color:#fff;padding:24px;text-align:center;">
      <p style="font-size:18px;font-weight:700;margin-bottom:6px;">🏪 EasyShop Seller Portal</p>
      <p style="opacity:.7;font-size:13px;">© 2024 EasyShop. All rights reserved.</p>
    </div>
  </div></body></html>`;

  try {
    const info = await transporter.sendMail({
      from: { name: 'EasyShop Orders', address: process.env.SMTP_USER },
      to: sellerEmail,
      subject: `❌ Order Cancelled ${orderId} — Refund Required`,
      html,
    });
    console.log('[email] Cancellation/refund email sent to seller:', info.messageId);
    return { success: true };
  } catch (e) {
    console.error('[email] Failed to send cancellation to seller:', e.message);
    return { success: false, error: e.message };
  }
};

// ─── CANCELLATION CONFIRMATION EMAIL (to buyer) ──────────────────────────────
const sendCancellationToUser = async (email, userName, order) => {
  const orderId = `#${order._id.toString().slice(-6).toUpperCase()}`;
  const total = (order.subtotal || 0) + (order.deliveryFee || 0);

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head><body style="font-family:'Segoe UI',sans-serif;background:#f4f6f8;margin:0;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#f39c12,#e67e22);padding:36px 30px;text-align:center;color:#fff;">
      <div style="font-size:48px;">🔄</div>
      <h1 style="margin:10px 0 4px;">Order Cancelled</h1>
      <p style="opacity:.9;font-size:16px;">Your refund is being processed</p>
    </div>
    <div style="padding:30px;">
      <p style="font-size:16px;color:#333;">Hi <strong>${userName || 'Valued Customer'}</strong>,</p>
      <p style="color:#555;">Your order has been successfully cancelled. The seller has been notified and will process your refund shortly.</p>

      <div style="background:#fef9ec;border-radius:12px;padding:16px;margin:20px 0;border-left:4px solid #f39c12;">
        <p style="margin:0 0 6px;"><strong>Order ID:</strong> ${orderId}</p>
        <p style="margin:0 0 6px;"><strong>Payment Method:</strong> ${order.paymentMethod?.toUpperCase() || 'N/A'}</p>
        <p style="margin:0;"><strong>Refund Amount:</strong> <span style="color:#e67e22;font-weight:700;font-size:16px;">UGX ${total.toLocaleString()}</span></p>
      </div>

      <div style="background:#d5f5e3;border-radius:12px;padding:20px;margin-top:16px;border-left:4px solid #27ae60;">
        <h3 style="color:#1e8449;margin-bottom:10px;">💰 What Happens Next?</h3>
        <ol style="color:#1e8449;padding-left:20px;line-height:2;">
          <li>The seller has been notified of your cancellation</li>
          <li>They will contact you to confirm refund details</li>
          <li>Your refund of <strong>UGX ${total.toLocaleString()}</strong> will be sent via <strong>${order.paymentMethod?.toUpperCase() || 'your original payment method'}</strong></li>
          <li>Refunds typically take <strong>3–5 business days</strong></li>
        </ol>
      </div>

      <p style="color:#888;font-size:13px;margin-top:20px;">If you don't receive your refund within 5 business days, please contact EasyShop support.</p>
    </div>
    <div style="background:#1f2937;color:#fff;padding:24px;text-align:center;">
      <p style="font-size:18px;font-weight:700;margin-bottom:6px;">🛍️ EasyShop</p>
      <p style="opacity:.7;font-size:13px;">© 2024 EasyShop. All rights reserved.</p>
    </div>
  </div></body></html>`;

  try {
    const info = await transporter.sendMail({
      from: { name: 'EasyShop', address: process.env.SMTP_USER },
      to: email,
      subject: `🔄 Order Cancelled ${orderId} — Refund In Progress`,
      html,
    });
    console.log('[email] Cancellation confirmation sent to user:', info.messageId);
    return { success: true };
  } catch (e) {
    console.error('[email] Failed to send cancellation to user:', e.message);
    return { success: false, error: e.message };
  }
};

// ─── REFUND COMPLETED EMAIL (to buyer) ──────────────────────────────────────
const sendRefundCompletedToUser = async (email, userName, order, refundDetails) => {
  const orderId = `#${order._id.toString().slice(-6).toUpperCase()}`;
  const total = (order.subtotal || 0) + (order.deliveryFee || 0);
  const method = refundDetails?.method || order.paymentMethod?.toUpperCase() || 'N/A';
  const reference = refundDetails?.reference || '';
  const notes = refundDetails?.notes || '';

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head><body style="font-family:'Segoe UI',sans-serif;background:#f4f6f8;margin:0;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#27ae60,#2ecc71);padding:36px 30px;text-align:center;color:#fff;">
      <div style="font-size:48px;">✅</div>
      <h1 style="margin:10px 0 4px;">Refund Completed!</h1>
      <p style="opacity:.9;font-size:16px;">Your refund has been processed successfully</p>
    </div>
    <div style="padding:30px;">
      <p style="font-size:16px;color:#333;">Hi <strong>${userName || 'Valued Customer'}</strong>,</p>
      <p style="color:#555;">Great news! The seller has completed your refund. Please check your account for the refunded amount.</p>

      <div style="background:#f0faf4;border-radius:12px;padding:16px;margin:20px 0;border-left:4px solid #27ae60;">
        <p style="margin:0 0 6px;"><strong>Order ID:</strong> ${orderId}</p>
        <p style="margin:0 0 6px;"><strong>Refund Amount:</strong> <span style="color:#27ae60;font-weight:700;font-size:16px;">UGX ${total.toLocaleString()}</span></p>
        <p style="margin:0 0 6px;"><strong>Refund Method:</strong> ${method}</p>
        ${reference ? `<p style="margin:0 0 6px;"><strong>Transaction Reference:</strong> ${reference}</p>` : ''}
        ${notes ? `<p style="margin:0;"><strong>Note from Seller:</strong> ${notes}</p>` : ''}
      </div>

      <div style="background:#e8f8f0;border-radius:10px;padding:16px;margin-top:16px;border-left:4px solid #27ae60;">
        <p style="margin:0;color:#1e8449;font-size:14px;">💰 If you don't see the refund in your account within 24 hours, please contact EasyShop support with your order ID: <strong>${orderId}</strong></p>
      </div>
    </div>
    <div style="background:#1f2937;color:#fff;padding:24px;text-align:center;">
      <p style="font-size:18px;font-weight:700;margin-bottom:6px;">🛍️ EasyShop</p>
      <p style="opacity:.7;font-size:13px;">© 2024 EasyShop. All rights reserved.</p>
    </div>
  </div></body></html>`;

  try {
    const info = await transporter.sendMail({
      from: { name: 'EasyShop', address: process.env.SMTP_USER },
      to: email,
      subject: `✅ Refund Completed ${orderId} — UGX ${total.toLocaleString()} Sent`,
      html,
    });
    console.log('[email] Refund completed email sent to user:', info.messageId);
    return { success: true };
  } catch (e) {
    console.error('[email] Failed to send refund completed email:', e.message);
    return { success: false, error: e.message };
  }
};

module.exports = {
  generateOTP,
  generateUserOTP,
  sendOTPEmail,
  sendUserOTPEmail,
  sendWelcomeEmail,
  sendUserWelcomeEmail,
  sendOrderConfirmationToUser,
  sendNewOrderToSeller,
  sendCancellationToSeller,
  sendCancellationToUser,
  sendRefundCompletedToUser,
};