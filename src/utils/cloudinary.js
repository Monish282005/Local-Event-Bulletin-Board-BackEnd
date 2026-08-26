const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'evrmjfy2',
  api_key: process.env.CLOUDINARY_API_KEY || '981936459317943',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'R5Ic71_WMLCOK9VolkE6O8yctHE',
});

/**
 * Uploads Base64 or image data to Cloudinary and returns HTTPS CDN URL.
 */
async function uploadToCloudinary(fileString, folder = 'local_events') {
  if (!fileString || typeof fileString !== 'string') return null;
  const trimmed = fileString.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  try {
    const uploadResponse = await cloudinary.uploader.upload(trimmed, {
      folder: folder,
      resource_type: 'auto',
    });
    return uploadResponse.secure_url;
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    return null;
  }
}

module.exports = {
  cloudinary,
  uploadToCloudinary,
};
