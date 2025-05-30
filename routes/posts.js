const express = require('express');
const puppeteer = require('puppeteer');
const axios = require('axios');
const Post = require('../models/Post');
const router = express.Router();

// Configura le chiavi API e credenziali
const GROK_API_KEY = 'xai-xryu4NiJmdpeypKBlAVHBPO1Hkr5vqXSEfo7EEJhvj2xoJxzoqGq0HQJpDzQsB4Hwr1cpI3VGXuqNuis'; // Sostituisci con la tua chiave API
const LINKEDIN_USERNAME = 'ftacchini85@gmail.com';
const LINKEDIN_PASSWORD = 'Taccozio_32';
const BOT_COMMENT_SIGNATURE = 'Scopri l’analisi di questo post su LinkedAi';

// Funzione di pausa casuale
function randomDelay(min = 1000, max = 3000) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    console.log(`Waiting for ${delay} ms...`);
    return new Promise(resolve => setTimeout(resolve, delay));
}

// Funzione per analizzare un post con Grok
async function analyzePost(post) {
    try {
        console.log(`Analyzing post ${post.postId} with Grok...`);
        const prompt = `
            Analizza il seguente post di LinkedIn e restituisci un'analisi in formato JSON con:
            - utility (0-100): quanto è educativo/informativo
            - vanity (0-100): quanto è auto-promozionale
            - engagement (0-100): livello di coinvolgimento
            - sentiment: positivo, negativo, neutrale
            - sector_relevance (0-100): rilevanza per tecnologia/marketing
            - text_analysis: breve descrizione delle metriche (max 50 parole)
            - suggestion: consiglio per migliorare il post (max 30 parole)

            Post: ${post.content}
        `;
        const response = await axios.post('https://api.x.ai/v1/chat/completions', {
            model: 'grok-3',
            messages: [
                { role: 'system', content: 'Sei un analista di social media.' },
                { role: 'user', content: prompt }
            ],
            response_format: { type: 'json_object' }
        }, {
            headers: {
                'Authorization': `Bearer ${GROK_API_KEY}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        console.log(`Grok API response for post ${post.postId}:`, JSON.stringify(response.data, null, 2));
        const analysis = JSON.parse(response.data.choices[0].message.content);
        console.log(`Parsed analysis for post ${post.postId}:`, analysis);

        // Validazione dei valori
        const sentimentLower = analysis.sentiment ? analysis.sentiment.toLowerCase() : '';
        if (
            typeof analysis.utility !== 'number' || analysis.utility < 0 || analysis.utility > 100 ||
            typeof analysis.vanity !== 'number' || analysis.vanity < 0 || analysis.vanity > 100 ||
            typeof analysis.engagement !== 'number' || analysis.engagement < 0 || analysis.engagement > 100 ||
            !['positivo', 'negativo', 'neutrale'].includes(sentimentLower) ||
            typeof analysis.sector_relevance !== 'number' || analysis.sector_relevance < 0 || analysis.sector_relevance > 100 ||
            typeof analysis.text_analysis !== 'string' || analysis.text_analysis.length > 500 ||
            typeof analysis.suggestion !== 'string' || analysis.suggestion.length > 200
        ) {
            console.error(`Validation failed for post ${post.postId}:`, {
                utility: analysis.utility,
                vanity: analysis.vanity,
                engagement: analysis.engagement,
                sentiment: sentimentLower,
                sector_relevance: analysis.sector_relevance,
                text_analysis_length: analysis.text_analysis?.length,
                suggestion_length: analysis.suggestion?.length
            });
            throw new Error('Invalid analysis format from Grok API');
        }

        // Normalizza il sentiment
        analysis.sentiment = sentimentLower;
        return analysis;
    } catch (apiErr) {
        console.error(`Grok API error for post ${post.postId}:`, {
            message: apiErr.message,
            code: apiErr.code,
            response: apiErr.response ? {
                status: apiErr.response.status,
                data: apiErr.response.data
            } : 'No response',
            stack: apiErr.stack
        });
        return {
            utility: 80,
            vanity: 20,
            engagement: 50,
            sentiment: 'positivo',
            sector_relevance: 85,
            text_analysis: 'Analisi non disponibile a causa di un errore.',
            suggestion: 'Suggerimento non disponibile.'
        };
    }
}

// Funzione per pubblicare un commento
async function postComment(post) {
    let browser;
    try {
        console.log(`Posting comment for post ${post.post_id}...`);
        const comment = `Scopri l’analisi di questo post su LinkedAi: ${post.analysis_url}`;

        browser = await puppeteer.launch({
            headless: false,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            timeout: 60000
        });
        const page = await browser.newPage();

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

        console.log('Navigating to login page for commenting...');
        await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
        console.log('Typing credentials for commenting...');
        await page.type('#username', LINKEDIN_USERNAME);
        await page.type('#password', LINKEDIN_PASSWORD);
        await randomDelay();
        console.log('Submitting login for commenting...');
        await page.click('[data-litms-control-urn="login-submit"]');
        console.log('Waiting for navigation after login...');
        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 });

        const loginError = await page.$('.error-message');
        if (loginError) {
            const errorText = await page.evaluate(el => el.innerText, loginError);
            throw new Error(`Login failed during commenting: ${errorText}`);
        }

        console.log('Navigating to feed for commenting...');
        await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        console.log('Feed page loaded');
        await randomDelay(2000, 4000);

        console.log('Finding post to comment...');
        const commented = await page.evaluate(async (postId, commentText) => {
            const postElement = Array.from(document.querySelectorAll('.feed-shared-update-v2')).find(
                el => el.closest('[data-id]')?.getAttribute('data-id') === postId
            );
            if (!postElement) return false;

            const commentButton = postElement.querySelector('.comment-button');
            if (!commentButton) return false;

            commentButton.click();
            await new Promise(resolve => setTimeout(resolve, 1000));

            const commentBox = postElement.querySelector('.comments-comment-box__editor-container');
            if (!commentBox) return false;

            await commentBox.click();
            await new Promise(resolve => setTimeout(resolve, 500));

            const editor = postElement.querySelector('.ql-editor');
            if (!editor) return false;

            editor.innerText = commentText;
            await new Promise(resolve => setTimeout(resolve, 500));

            const submitButton = postElement.querySelector('.comments-comment-box__submit-button');
            if (!submitButton) return false;

            submitButton.click();
            return true;
        }, post.post_id, comment);

        if (commented) {
            console.log(`Comment posted for ${post.post_id}: ${comment}`);
            return true;
        } else {
            console.log(`Failed to post comment for ${post.post_id}: ${comment}`);
            return false;
        }
    } catch (err) {
        console.error(`Error posting comment for post ${post.post_id}:`, err.message);
        return false;
    } finally {
        if (browser) {
            console.log('Closing browser after commenting...');
            await browser.close();
        }
    }
}

// Funzione di scraping riutilizzabile
async function scrapePosts() {
    let browser;
    try {
        console.log('Launching browser...');
        browser = await puppeteer.launch({
            headless: false,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            timeout: 60000
        });
        const page = await browser.newPage();

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

        console.log('Navigating to login page...');
        await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
        console.log('Login page loaded');

        console.log('Typing credentials...');
        await page.type('#username', LINKEDIN_USERNAME);
        await page.type('#password', LINKEDIN_PASSWORD);
        await randomDelay();
        console.log('Submitting login...');
        await page.click('[data-litms-control-urn="login-submit"]');

        console.log('Waiting for navigation after login...');
        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 });

        const loginError = await page.$('.error-message');
        if (loginError) {
            const errorText = await page.evaluate(el => el.innerText, loginError);
            throw new Error(`Login failed: ${errorText}`);
        }
        console.log('Login successful, navigating to posts...');

        await page.goto('https://www.linkedin.com/feed/?trk=604_page', { waitUntil: 'domcontentloaded', timeout: 60000 });
        console.log('Posts page loaded');
        await randomDelay(3000, 5000);

        console.log('Scrolling to load posts...');
        await page.evaluate(async () => {
            await new Promise(resolve => {
                let totalHeight = 0;
                const distance = 100;
                let scrolls = 0;
                const maxScrolls = 1; // Limitato a 1 per test
                const timer = setInterval(() => {
                    const scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;
                    scrolls++;
                    if (totalHeight >= scrollHeight || scrolls >= maxScrolls) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 2000);
            });
        });
        console.log('Scrolling completed');

        console.log('Extracting post texts, authors, and IDs...');
        const posts = await page.evaluate(async (botCommentSignature) => {
            const postElements = document.querySelectorAll('.feed-shared-update-v2');
            console.log(`Total post elements found: ${postElements.length}`);
            const postData = [];
            for (const [index, post] of postElements.entries()) {
                const dataId = post.closest('[data-id]')?.getAttribute('data-id');
                console.log(`Post ${index}: data-id=${dataId}`);
                if (!dataId || !dataId.startsWith('urn:li:activity:') && !dataId.startsWith('urn:li:ugcPost:')) {
                    console.log(`Skipping post ${index}: invalid data-id (${dataId})`);
                    continue;
                }
                const contentElement = post.querySelector('.update-components-text .break-words');
                const content = contentElement ? contentElement.textContent : null;
                const authorElement = post.querySelector('.update-components-actor__single-line-truncate span');
                const author = authorElement ? authorElement.textContent.split('\n')[0].trim() : null;

                if (!content || !author) {
                    console.log(`Skipping post ${index} (data-id=${dataId}): missing content or author (content=${!!content}, author=${author})`);
                    continue;
                }

                const commentButton = post.querySelector('.social-details-social-counts__comments button');
                let hasBotComment = false;
                if (commentButton) {
                    commentButton.click();
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    const commentElements = post.querySelectorAll('.comments-comment-item__main-content');
                    for (const commentEl of commentElements) {
                        const commentText = commentEl.textContent || '';
                        if (commentText.includes(botCommentSignature)) {
                            hasBotComment = true;
                            break;
                        }
                    }
                }

                if (hasBotComment) {
                    console.log(`Skipping post ${index} (data-id=${dataId}): contains bot comment`);
                    continue;
                }

                postData.push({ postId: dataId, content, author });
                if (postData.length >= 1) break; // Limita a 1 post per test
            }
            return postData;
        }, BOT_COMMENT_SIGNATURE);

        console.log(`Found ${posts.length} posts`);
        console.log('Extracted posts:', JSON.stringify(posts, null, 2));

        const savedPosts = [];
        if (posts.length > 0) {
            for (const post of posts) {
                // Controlla se il post esiste già
                const existingPost = await Post.findOne({ post_id: post.postId });
                if (existingPost) {
                    console.log(`Skipping post ${post.postId}: already exists in database`);
                    continue;
                }

                // Analizza il post con Grok
                const analysis = await analyzePost(post);

                const postData = {
                    post_id: post.postId,
                    author: post.author,
                    content: post.content,
                    timestamp: new Date().toISOString(),
                    extracted_at: new Date().toISOString(),
                    utility: analysis.utility,
                    vanity: analysis.vanity,
                    engagement: analysis.engagement,
                    sentiment: analysis.sentiment,
                    sector_relevance: analysis.sector_relevance,
                    text_analysis: analysis.text_analysis,
                    suggestion: analysis.suggestion,
                    analysis_url: `https://<your-domain>/analisi/${post.postId}`,
                    commented: false
                };
                console.log(`Saving post: ${postData.post_id}`);
                await Post.findOneAndUpdate(
                    { post_id: postData.post_id },
                    postData,
                    { upsert: true, new: true }
                );

                // Pubblica il commento
                const commented = await postComment(postData);
                if (commented) {
                    await Post.updateOne(
                        { post_id: postData.post_id },
                        { $set: { commented: true } }
                    );
                    console.log(`Updated post ${postData.post_id} with commented: true`);
                }

                savedPosts.push(postData);
            }
        } else {
            console.log('No new posts found, no test post will be saved.');
        }

        console.log(`Saved ${savedPosts.length} posts`);
        return savedPosts;
    } catch (err) {
        console.error('Scraping error:', err.message);
        throw err;
    } finally {
        if (browser) {
            console.log('Closing browser...');
            await browser.close();
        }
    }
}

// Rotta per triggerare lo scraping manualmente
router.post('/collect', async (req, res) => {
    try {
        const savedPosts = await scrapePosts();
        res.json({ message: 'Posts collected', posts: savedPosts });
    } catch (err) {
        res.status(500).json({ error: 'Failed to collect posts', details: err.message });
    }
});

// Rotta per la pagina di analisi del post
router.get('/analisi/:postId', async (req, res) => {
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
        console.log(`Rendering analysis for post ${req.params.postId}:`, metrics);
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

// Rotta per pubblicare un commento a posteriori
router.post('/comment/:postId', async (req, res) => {
    try {
        console.log(`Attempting to post comment for post ${req.params.postId}...`);
        const post = await Post.findOne({ post_id: req.params.postId });
        if (!post) {
            return res.status(404).json({ error: 'Post not found' });
        }
        if (post.commented) {
            return res.status(400).json({ error: 'Comment already posted for this post' });
        }

        const commented = await postComment(post);
        if (commented) {
            await Post.updateOne(
                { post_id: post.post_id },
                { $set: { commented: true } }
            );
            console.log(`Updated post ${post.post_id} with commented: true`);
            res.json({ message: 'Comment posted successfully' });
        } else {
            res.status(500).json({ error: 'Failed to post comment' });
        }
    } catch (err) {
        console.error(`Error in comment route for post ${req.params.postId}:`, err.message);
        res.status(500).json({ error: 'Failed to post comment', details: err.message });
    }
});

// Rotta per commentare tutti i post non commentati
router.post('/comment/all', async (req, res) => {
    try {
        console.log('Attempting to post comments for all uncommented posts...');
        const posts = await Post.find({ commented: false });
        console.log(`Found ${posts.length} uncommented posts`);

        let commentedCount = 0;
        for (const post of posts) {
            const commented = await postComment(post);
            if (commented) {
                await Post.updateOne(
                    { post_id: post.post_id },
                    { $set: { commented: true } }
                );
                console.log(`Updated post ${post.post_id} with commented: true`);
                commentedCount++;
            }
        }

        res.json({ message: `Commented ${commentedCount} posts successfully` });
    } catch (err) {
        console.error('Error in comment/all route:', err.message);
        res.status(500).json({ error: 'Failed to post comments', details: err.message });
    }
});

module.exports = { router, scrapePosts };