const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const axios = require('axios');
const { router: postRoutes, scrapePosts } = require('./routes/posts');

const app = express();

// Configura EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Connessione a MongoDB
mongoose.connect('mongodb://localhost:27017/linkedai_db')
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// Rotte
app.use('/api/posts', postRoutes);

// Rotta per la pagina di analisi del post
app.get('/analisi/:postId', async (req, res) => {
    try {
        const Post = mongoose.model('Post');
        const post = await Post.findOne({ post_id: req.params.postId });
        if (!post) {
            return res.status(404).render('error', { message: 'Post non trovato' });
        }
        const metrics = {
            utility: post.utility || 'N/A',
            vanity: post.vanity || 'N/A',
            engagement: post.engagement || 'N/A',
            sentiment: post.sentiment || 'N/A',
            sector_relevance: post.sector_relevance || 'N/A',
            text_analysis: post.text_analysis || 'Nessuna analisi disponibile.',
            suggestion: post.suggestion || 'Nessun suggerimento disponibile.'
        };
        console.log(`Rendering analysis for post ${req.params.postId}:`, metrics); // Log per debug
        res.render('analysis', {
            postId: post.post_id,
            author: post.author,
            content: post.content,
            metrics
        });
    } catch (err) {
        console.error('Error fetching post:', err.message);
        res.status(500).render('error', { message: 'Errore nel caricamento del post' });
    }
});

// Rotta per la homepage
app.get('/', async (req, res) => {
    try {
        const Post = mongoose.model('Post');
        const postCount = await Post.countDocuments();
        const lastPost = await Post.findOne().sort({ extracted_at: -1 });
        const lastScraped = lastPost ? lastPost.extracted_at : null;
        res.render('index', { postCount, lastScraped });
    } catch (err) {
        console.error('Error fetching stats:', err.message);
        res.render('index', { postCount: 0, lastScraped: null });
    }
});

// Esegui lo scraping all'avvio del server
const startScraping = async () => {
    try {
        console.log('Starting initial scraping...');
        await scrapePosts();
        console.log('Initial scraping completed.');
    } catch (err) {
        console.error('Error during initial scraping:', err.message);
    }
};

// Avvia il server e lo scraping
const PORT = 8000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    startScraping();
});