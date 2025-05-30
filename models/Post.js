const mongoose = require('mongoose');

const PostSchema = new mongoose.Schema({
    post_id: { type: String, required: true, unique: true },
    author: String,
    content: String,
    timestamp: String,
    extracted_at: String,
    utility: Number,
    vanity: Number,
    engagement: Number,
    sentiment: String,
    sector_relevance: Number,
    text_analysis: String,
    suggestion: String,
    analysis_url: String,
    commented: { type: Boolean, default: false } // Nuovo campo
});

module.exports = mongoose.model('Post', PostSchema);