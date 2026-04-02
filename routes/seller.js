const express = require('express');
const { generateOTP, sendOTPEmail, sendWelcomeEmail } = require('../services/emailService');
const router = express.Router();

// In-memory storage for OTPs (in production, use Redis or database)
const otpStorage = new Map();
const sellerStorage = new Map();

// Strong password validation function
const validatePassword = (password) => {
  const errors = [];
  
  // Minimum length
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  
  // Maximum length (reasonable limit)
  if (password.length > 128) {
    errors.push('Password must be less than 128 characters');
  }
  
  // Must co