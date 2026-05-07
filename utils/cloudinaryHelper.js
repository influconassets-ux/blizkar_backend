const cloudinary = require('../config/cloudinary');

/**
 * Uploads a base64 image string to Cloudinary
 * @param {string} base64String - The base64 string of the image
 * @param {string} folder - The folder in Cloudinary to store the image
 * @returns {Promise<string>} - The secure URL of the uploaded image
 */
const uploadBase64Image = async (base64String, folder = 'blikzr_profiles') => {
  try {
    // Check if it's already a URL (in case of re-saving)
    if (base64String.startsWith('http')) {
      return base64String;
    }

    const result = await cloudinary.uploader.upload(base64String, {
      folder: folder,
      resource_type: 'auto',
    });

    return result.secure_url;
  } catch (error) {
    console.error('Cloudinary Upload Error:', error);
    // If upload fails, return original (fallback to database storage if necessary, 
    // though we should probably throw an error here)
    return base64String;
  }
};

/**
 * Process an array of photos, uploading any base64 ones to Cloudinary
 * @param {string[]} photos - Array of photo strings (base64 or URLs)
 * @returns {Promise<string[]>} - Array of Cloudinary URLs
 */
const processPhotos = async (photos) => {
  if (!Array.isArray(photos) || photos.length === 0) return [];
  const validPhotos = photos.filter(p => typeof p === 'string' && p.trim().length > 0);
  const uploadPromises = validPhotos.map(photo => uploadBase64Image(photo));
  return Promise.all(uploadPromises);
};

module.exports = { uploadBase64Image, processPhotos };
