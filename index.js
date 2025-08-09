const express = require('express');
const app = express();
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccount.json");
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const nodemailer = require('nodemailer');
const port = process.env.PORT || 5000;

// middlewares
app.use(cors({
    origin: ['https://richter-restaurant.web.app', 'http://localhost:5173'],
}));
app.use(express.json())
// app.options('/sendMail', cors())

// verify token
const verifyToken = (req, res, next) => {
    if (!req.headers.authorization) {
        return res.status(401).send({ message: 'Forbidden access' })
    }
    const token = req.headers.authorization.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ message: 'Forbidden access' })
        }
        req.user = decoded
        // console.log('decoded', decoded)
        next()
    })
};

// firebase auth admin
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

// configure nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.NODEMAILER_AUTH_GMAIL_ID,
        pass: process.env.NODEMAILER_AUTH_GMAIL_APP_PASS
    }
});

// verify email function
const randString = () => {
    const len = 8;
    let randStr = '';
    for (let i = 0; i < len; i++) {
        const ch = Math.floor((Math.random() * 10) + 1);
        randStr += ch
    }

    return randStr
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.g8eto.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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

        // mongodb collections
        const userCollection = client.db('RichterDb').collection("users");
        const menuCollection = client.db('RichterDb').collection("menu");
        const reviewCollection = client.db('RichterDb').collection("reviews");
        const cartCollection = client.db('RichterDb').collection("cart");
        const paymentCollection = client.db('RichterDb').collection("payments");
        const falseCollection = client.db('RichterDb').collection("falseUser");

        // middleware verify admin
        const verifyAdmin = async (req, res, next) => {
            const email = req.user.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            // verify is it an admin account or not
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next()
        }

        // api routes

        // jwt api
        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            res.send({ token })
        })

        // user related api only admin access
        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result)
        })

        // post user to database if exists return it, if valid does not make it valid:true
        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email };
            const uniqueString = randString();
            const isValid = false;

            const existingUser = await userCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'user already exists', insertedId: null })
            }

            const newUser = {
                isValid,
                uniqueString: parseFloat(uniqueString),
                ...user
            };

            // send verification mail of your own
            const sendMail = await transporter.sendMail({
                from: 'alzami4969@gmail.com',
                to: newUser.email,
                subject: "Verify Your email address",
                html: `Hello ${newUser.name} <br/>
                    Follow this link to verify your email address. <br/>
                    <a href="https://richter-restaurant-server.vercel.app/verify/${newUser.uniqueString}?uid=${newUser.uid}" >Here</a> <br/>
                    if you didn't ask to verify this address, you can ignore this email. <br/>
                    Thanks. <br/>
                     regards from Richter Restaurant Team
                `
            });
            const result = await userCollection.insertOne(newUser);
            return res.send(result)
        })

        // verify email
        app.get('/verify/:uniqueString', async (req, res) => {
            const { uniqueString } = req.params;
            const uid = req.query.uid;
            // console.log('id', uniqueString);
            const query = {
                uniqueString: parseFloat(uniqueString)
            }

            // console.log(query)
            const user = await userCollection.findOne((query));
            // console.log(user)
            if (user) {
                // user.isValid = true;
                const filter = { uniqueString: parseFloat(uniqueString) };
                const updatedDoc = {
                    $set: {
                        isValid: true
                    }
                }

                const result = await userCollection.updateOne(filter, updatedDoc)
                if (result.modifiedCount > 0) {
                    try {
                        const userRecord = await admin.auth().updateUser(uid, {
                            emailVerified: true
                        })
                    }
                    catch (error) {
                        console.log(error)
                    }
                }
                // await userCollection.insertOne(user)
                res.send('User verified Successfully')
            }
            else {
                res.json('invalid User')
            }
        })

        app.get('/sendMail/:email', async (req, res) => {

            const email = req.params.email;
            const user = await userCollection.findOne({ email });

            const sendMail = await transporter.sendMail({
                from: 'alzami4969@gmail.com',
                to: user.email,
                subject: "Verify Your email address",
                html: `Hello ${user.name} <br/>
                Follow this link to verify your email address. <br/>
                <a href="https://richter-restaurant-server.vercel.app/verify/${user.uniqueString}?uid=${user.uid}" >Here</a> <br/>
                if you didn't ask to verify this address, you can ignore this email. <br/>
                Thanks. <br/>
                 regards from Richter Restaurant Team
            `
            });
            res.send({ message: 'email sent successfully' })
        })

        // check if the user is valid or not
        app.get('/checkValid/:email', async (req, res) => {
            const email = req.params.email;
            if (email) {
                const query = {
                    email
                };
                const result = await userCollection.findOne(query);
                res.send(result)
            }
        })

        // delete user from firebase and database as well
        app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const email = req.query.email; // query parameter email passes from client side
            if (email) {
                const userRecord = await admin.auth().getUserByEmail(email);
                await admin.auth().deleteUser(userRecord.uid)
            }
            const query = { _id: new ObjectId(id) };
            const result = await userCollection.deleteOne(query);
            res.send(result)
        });

        // update to verified user
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updatedDoc = {
                $set: {
                    isValid: true
                }
            }

            const result = await userCollection.updateOne(filter, updatedDoc);
            res.send(result)
        })

        // users admin related api

        // make an user admin
        app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            };
            const result = await userCollection.updateOne(filter, updatedDoc);
            res.send(result)
        })

        // check if the user is admin or not
        app.get('/users/admin/:id', verifyToken, async (req, res) => {
            const email = req.params.id;
            if (email !== req.user.email) {
                // console.log('unauthorized access')
                return res.status(403).send({ message: 'unauthorized access' })
            }
            const query = { email: email }
            const user = await userCollection.findOne(query)
            // console.log(user.email)
            let admin = false;
            if (user) {
                admin = user?.role === 'admin'
            }
            // console.log(admin)
            res.send({ admin })
        })

        // menu
        app.get('/menu', async (req, res) => {
            const { category, page, limit } = req.query;
            const skip = (page - 1) * limit;
            // const query = {
            //     $in: {
            //         category: category
            //     }
            // }

            if (category || page || limit) {
                const result = await menuCollection.find({ category }).skip(skip).limit(Number(limit)).toArray();
                const total = await menuCollection.countDocuments({ category });
                res.send({ result, total })
            }
            else {
                const result = await menuCollection.find().toArray();
                res.send(result)
            }
        })

        app.post('/menu', verifyToken, verifyAdmin, async (req, res) => {
            const item = req.body;
            const result = await menuCollection.insertOne(item);
            res.send(result)
        })

        app.delete('/menu/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: id };
            // console.log(query)
            const result = await menuCollection.deleteOne(query);
            res.send(result)
        })

        app.get('/menu/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: id };
            const result = await menuCollection.findOne(query)
            res.send(result)
        })

        app.patch('/menu/:id', async (req, res) => {
            const item = req.body;
            const id = req.params.id;
            const filter = { _id: id };
            const updatedDoc = {
                $set: {
                    name: item.name,
                    category: item.category,
                    price: item.price,
                    recipe: item.price,
                    image: item?.image
                }
            }
            const result = await menuCollection.updateOne(filter, updatedDoc);
            res.send(result)
        })

        // reviews related api
        app.get('/reviews', async (req, res) => {
            const result = await reviewCollection.find().toArray()
            res.send(result)
        })

        app.post('/reviews', verifyToken, async (req, res) => {
            const review = req.body;
            const result = await reviewCollection.insertOne(review);
            res.send(result)
        })

        // cart collection

        app.get('/carts', verifyToken, async (req, res) => {
            const email = req.query.email;
            const query = {
                email: email
            }
            const result = await cartCollection.find(query).toArray();
            res.send(result)
        })

        app.post('/carts', async (req, res) => {
            const cartItem = req.body;
            const result = await cartCollection.insertOne(cartItem);
            res.send(result)
        })

        app.delete('/carts/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await cartCollection.deleteOne(query);
            res.send(result)
        })

        // payment intent
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            // console.log(amount)
            // console.log(stripe.paymentIntents)
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });
            // console.log(paymentIntent)
            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })

        // payment related api
        app.get('/payments/:email', verifyToken, async (req, res) => {
            const query = { email: req.params.email };
            if (req.params.email !== req.user.email) {
                return res.send(403).send({ message: 'forbidden access' })
            }
            const result = await paymentCollection.find(query).toArray();

            const formattedResult = result.map(item => {
                if (item.orderedDate) {
                    item.newOrderDate = new Date(item.orderedDate).toString().split("T")[0];
                }
                else if (item.date) {
                    item.newDate = new Date(item.date).toISOString().split("T")[0];
                }

                return item;
            });

            res.send(formattedResult)
        })

        app.get('/payments/reservation/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            // console.log(email)
            const query = {
                email: email,
                paymentType: 'reservation'
            }
            if (req.params.email !== req.user.email) {
                return
            }
            const result = await paymentCollection.find(query).toArray();
            res.send(result)
        })

        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const paymentResult = await paymentCollection.insertOne(payment); //inset payment info in db collection

            // carefully delete each item from the cart of the user or cartCollection
            // console.log(payment.cartIds)
            const query = {
                _id: {
                    $in: payment.cartIds.map((id) => new ObjectId(id))
                }
            };

            const deletedResult = await cartCollection.deleteMany(query);

            const sendMail = await transporter.sendMail({
                from: "alzami4969@gmail.com",
                to: payment.email,
                subject: "Verify Your email address",
                html: `<p> Thank you for your order! </p>
                     <p>Please verify your email by clicking the link below:</p>
                `
            });
            // console.log(sendMail)
            res.send({ paymentResult, deletedResult })
        })

        // stats analytics
        app.get('/admin-stats', verifyToken, verifyAdmin, async (req, res) => {
            const users = await userCollection.estimatedDocumentCount();
            const menuItems = await menuCollection.estimatedDocumentCount();
            const orders = await paymentCollection.estimatedDocumentCount();
            // this is not the best way
            // const payments = await paymentCollection.find().toArray();
            // const revenue = payments.reduce((total, payment) => total + payment.price, 0);

            const result = await paymentCollection.aggregate([
                {
                    $group: {
                        _id: null,
                        totalRevenue: {
                            $sum: '$price'
                        }
                    }
                }
            ]).toArray();

            const revenue = result.length > 0 ? result[0].totalRevenue : 0;

            res.send({
                users,
                menuItems,
                orders,
                revenue
            })
        })

        // user stat analytics
        app.get('/user-stats/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const menuItems = await menuCollection.estimatedDocumentCount();
            const cartItems = await cartCollection.countDocuments({ email });
            const bookings = await paymentCollection.countDocuments({ paymentType: 'reservation', email: email });
            const orders = await paymentCollection.countDocuments({ paymentType: 'cart', email: email });
            const payment = await paymentCollection.countDocuments({ email: email });
            const reviews = await reviewCollection.countDocuments({ email: email });

            // console.log({ menuItems, cartItems })
            res.send({
                menuItems,
                cartItems,
                bookings,
                orders,
                payment,
                reviews
            })

        })

        // send message to user's email


        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run()


app.get('/', async (req, res) => {
    res.send('richter restaurant server')
})


app.listen(port)