const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const port = process.env.PORT || 5000;

const app = express();

const corsOptions = {
    origin: ['http://localhost:5173', 'https://query-nest.web.app', 'https://query-nest.firebaseapp.com'],
    credentials: true,
}
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser())


// verify jwt middleware
const verifyToken = (req, res, next) => {
    const token = req.cookies?.token;
    if (!token) {
        return res.status(401).send({ message: 'Unauthorized Access' })
    }
    if (token) {
        jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
            if (err) {
                console.log(err)
                return res.status(401).send({ message: 'Unauthorized Access' })
            }
            // console.log(decoded);
            req.user = decoded
            next()
        })
    }
}

const cookieOption = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
}



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.sgvl42h.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});



async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();
        const queriesCollection = client.db('queryNest').collection('queries');
        const recommendationCollection = client.db('queryNest').collection('recommendation');
        const favoriteCollection = client.db('queryNest').collection('favorite');

        // jwt
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET);
            res.cookie('token', token, cookieOption)
                .send({ success: true })
        })

        // clear token
        app.post('/logout', async (req, res) => {
            const user = req.body;
            console.log("logging out", user);
            res
                .clearCookie('token', { ...cookieOption, maxAge: 0 })
                .send({ success: true })
        })



        // get all queries
        app.get('/queries', async (req, res) => {
            const result = await queriesCollection.find().sort({ _id: -1 }).toArray();
            res.send(result);
        })

        //get by email
        app.get('/queries/:email', verifyToken, async (req, res) => {
            const tokenEmail = req.user.email;
            const email = req.params.email;
            if (tokenEmail !== email) {
                return res.status(403).send({ message: 'Forbidden Access' })
            }
            const query = { userEmail: email }
            const result = await queriesCollection.find(query).sort({ _id: -1 }).toArray();
            res.send(result)
        })

        //delete a query
        app.delete('/query/:id', verifyToken, async (req, res) => {

            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await queriesCollection.deleteOne(query);
            res.send(result)
        })

        // save a query
        app.post('/queries', async (req, res) => {
            const queryData = req.body;
            // console.log(queryData)
            const result = await queriesCollection.insertOne(queryData);
            res.send(result)
        })

        //get a single query
        app.get('/query/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await queriesCollection.findOne(query);
            res.send(result);
        })

        // update a query in db
        app.put('/query/:id', async (req, res) => {
            const id = req.params.id;
            const queryData = req.body;
            const query = { _id: new ObjectId(id) }
            const options = { upsert: true }
            const updateDoc = {
                $set: {
                    ...queryData,
                },
            }
            const result = await queriesCollection.updateOne(query, updateDoc, options);
            res.send(result);
        })

        // recommendation post 
        app.post('/recommendation', async (req, res) => {
            const recommendationData = req.body;

            try {
                const result = await recommendationCollection.insertOne(recommendationData);

                const recommendQuery = { _id: new ObjectId(req.body.queryId) };
                const updateDoc = { $inc: { recommendationCount: 1 } };

                const updateRecommendCount = await queriesCollection.updateOne(recommendQuery, updateDoc);
                const updatedQuery = await queriesCollection.findOne(recommendQuery)
                console.log(updateRecommendCount);

                res.send({ result, updatedQuery });
            } catch (err) {
                console.error(err);
                res.status(500).send("Internal Server Error");
            }
        });

        // all recommendation get
        app.get('/recommendation', verifyToken, async (req, res) => {
            const result = await recommendationCollection.find().toArray();
            res.send(result);
        })

        //  get my recommendation 
        app.get('/my-recommendation/:email', verifyToken, async (req, res) => {
            const tokenEmail = req.user.email;
            const email = req.params.email;
            if (tokenEmail !== email) {
                return res.status(403).send({ message: 'Forbidden Access' })
            }
            const query = { recommenderEmail: email }
            const result = await recommendationCollection.find(query).toArray();
            res.send(result)
        })

        app.delete('/recommendation/:id', async (req, res) => {
            const id = req.params.id;

            try {

                const recommendationQuery = { _id: new ObjectId(id) };
                const recommendation = await recommendationCollection.findOne(recommendationQuery);
                if (!recommendation) {
                    return res.status(404).send("Recommendation not found");
                }

                const result = await recommendationCollection.deleteOne(recommendationQuery);

                const queryId = recommendation.queryId;
                const queryFilter = { _id: new ObjectId(queryId) };
                const updateDoc = { $inc: { recommendationCount: -1 } };

                const updateRecommendCount = await queriesCollection.updateOne(queryFilter, updateDoc);

                console.log(updateRecommendCount);

                res.send(result);
            } catch (err) {
                console.error(err);
                res.status(500).send("Internal Server Error");
            }
        });

        // get recommendations for me
        app.get('/recommendation-me/:email', verifyToken, async (req, res) => {
            const tokenEmail = req.user.email;
            const email = req.params.email;
            if (tokenEmail !== email) {
                return res.status(403).send({ message: 'Forbidden Access' })
            }
            const query = { userEmail: email }
            const result = await recommendationCollection.find(query).toArray();
            res.send(result)
        })

        // post for add to favorite

        app.post('/favorites', async (req, res) => {
            const queryData = req.body;
            // console.log(queryData)
            const result = await favoriteCollection.insertOne(queryData);
            res.send(result)
        })
        // app.post('/favorites', verifyToken, async (req, res) => {
        //     try {
        //         const { itemId } = req.body;
        //         const userId = req.user.id;

        //         // Add itemId to user's favorites array
        //         await client.db('queryNest').collection('favorites').updateOne(
        //             { userId: userId },
        //             { $addToSet: { favorites: itemId } },
        //             { upsert: true }
        //         );

        //         res.sendStatus(200);
        //     } catch (error) {
        //         console.error(error);
        //         res.status(500).send("Internal Server Error");
        //     }
        // });

        app.get('/favorites', async (req, res) => {
            const result = await favoriteCollection.find().sort({ _id: -1 }).toArray();
            res.send(result)
        })
        // get favorite 
        // app.get('/favorites/:email', verifyToken, async (req, res) => {
        //     // const tokenEmail = req.user.email;
        //     const email = req.params.email;
        //     // if (tokenEmail !== email) {
        //     //     return res.status(403).send({ message: 'Forbidden Access' })
        //     // }
        //     const query = { userEmail: email }
        //     const result = await favoriteCollection.find(query).sort({ _id: -1 }).toArray();
        //     res.send(result)
        // })

        app.get('/favorites/:email', async (req, res) => {
            const email = req.params.email;
            try {
                const query = { userEmail: email };
                const result = await favoriteCollection.find(query).sort({ _id: -1 }).toArray();
                res.send(result);
            } catch (error) {
                console.error("Error fetching favorites:", error);
                res.status(500).send({ message: "Error fetching favorites" });
            }
        });

        // delete favorite
        app.delete('/favorite/:id', verifyToken, async (req, res) => {

            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await favoriteCollection.deleteOne(query);
            res.send(result)
        })


        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Query Nest is running')
})

app.listen(port, () => {
    console.log(`Query Nest server is running on port ${port}`)
})
