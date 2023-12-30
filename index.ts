//link screenrecording: https://ap.cloud.panopto.eu/Panopto/Pages/Viewer.aspx?id=9f8b4d2c-adce-4208-ba05-b0d20168dacd
//link screenrecording voor deel 2: https://ap.cloud.panopto.eu/Panopto/Pages/Viewer.aspx?id=778ab351-c25b-4d4b-b6e5-b0d9013c7ff4

//Feedback: Geen geluid, dus volgende deel opnieuw toelichten. 
//Er voor zorgen dat je ingelogd blijft als je site herstart. 

import express from 'express';
import { MongoClient, ObjectId } from "mongodb";
import cookieParser from "cookie-parser";
import session from "express-session";
import 'dotenv/config';

const app = express();

app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.set("port", process.env.PORT);
app.use(cookieParser());

app.use(session({
    secret: "Isgeheim",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
}));

declare module 'express-session' {
    export interface SessionData {
        user: Profile
        successMessage?: string;
    }
}

interface Profile {
    _id?: ObjectId,
    id: number,
    name: string,
    email: string,
    friendsId: number[],
    picture: string,
    messages: string[],
    description: string,
    password: string
}

let profiles: Profile[] = [];

const uri = `mongodb+srv://${process.env.MONGO_NAME}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_CLUSTER}/?retryWrites=true&w=majority`;

const client = new MongoClient(uri);

let clientConnection = async () => {
    try {
        await client.connect();
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}


app.get("/", (req, res) => {
    res.render('login', {
        profiles: profiles,
    })
})

app.post("/login", (req, res) => {
    const name = req.body.name;
    const password = req.body.password;
    if (name && password) {
        const user = profiles.find((profile) => profile.name === name);
        if (user) {
            if (user.password === password) {
                req.session.user = user;
                req.session.successMessage = "Succesvol ingelogd!"
                req.session.save(() => res.redirect("/home"));
            }
            else {
                res.render('login', {
                    profiles: profiles,
                    message: "Verkeerde wachtwoord!"
                })
            }
        }
        else {
            res.render('login', {
                profiles: profiles,
                message: "Verkeerde naam en/of wachtwoord!"
            })
        }
    }
    else {
        res.redirect("/");
    }
});

app.post("/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/"));
})

app.get('/home', (req, res) => {
    const user = req.session.user;
    const successMessage = req.session.successMessage;

    if (!user) {
        return res.status(404).send('Gebruiker niet gevonden');
    } 

    req.session.successMessage = "";
        res.render('home', { 
        profiles: profiles, 
        user: user,
        message: successMessage
    });
    
});

app.get('/profiles', (req, res) => {
    const user = req.session.user;

    if (!user) {
        return res.status(404).send('Gebruiker niet gevonden');
    } 

    res.render('profiles', { profiles: profiles, user: user });
});

app.post('/friendship/:id', async (req, res) => {
    const profileId = parseInt(req.params.id); 
  
    const profile = profiles.find((p) => p.id === profileId);
    const user = req.session.user;
  
    if (user && profile) {
      user.friendsId.push(profile.id);
  
      await client
        .db("Profilesdb")
        .collection("Profile")
        .updateOne({ id: user.id }, { $push: { friendsId: profile.id } });
  
      profile.friendsId.push(user.id);
  
      await client
        .db("Profilesdb")
        .collection("Profile")
        .updateOne({ id: profile.id }, { $push: { friendsId: user.id } });
    
        console.debug(profiles);
    }
  
    res.redirect('/profiles');
});

app.get('/timeline/:userId', (req, res) => {
    const user = req.session.user;

    if (!user) {
        return res.status(404).send('Gebruiker niet gevonden');
    } 

    res.render('timeline', { user: user });
});

app.post('/timeline/post', (req, res) => {
    const user = req.session.user;

    if (!user) {
        return res.status(404).send('Gebruiker niet gevonden');
    }

    const message = req.body.message;
    user.messages.push(message);

    client.db("Profilesdb").collection("Profile").updateOne({id:user.id}, {$set:{messages: user.messages}});

    res.render('timeline', { user: user });
});

app.get('/profile/:userId', (req, res) => {
    const user = req.session.user;

    res.render('profile', { user });
});

app.post('/profile/edit', (req, res) => {
    const user = req.session.user;

    if (user) {
        user.picture = req.body.picture;
        user.description = req.body.description;
        client.db("Profilesdb").collection("Profile").updateOne({id:user.id}, {$set:{description: user.description}});
    } else {
        return res.status(404).send('Gebruiker niet gevonden');
    }

    res.redirect(`/profile/${user.id}`);
});

app.listen(app.get("port"), async () => {

    try {
        await client.connect();
        profiles = await client.db("Profilesdb").collection("Profile").find<Profile>({}).toArray();

        if (profiles.length === 0) {
            const profile = await (await fetch("https://randomuser.me/api/?inc=name,email,picture&nat=us&results=15")).json();
            const data = profile.results;
            const uniquePictures:string[] = [];
            let nextId:number = 1;
            profiles = data.map((profileData:any)=>{
            if (uniquePictures.includes(profileData.picture.large)) {
                return null;
                }
                uniquePictures.push(profileData.picture.large);
                const profile: Profile = {
                id: nextId,
                name: profileData.name.first + " " + profileData.name.last,
                email: profileData.email,
                friendsId:[],
                messages: [],
                picture: profileData.picture.large,
                description: "",
                password: profileData.name.first + profileData.name.last
                };
            nextId++;
            return profile;
            }).filter((profile:Profile) => profile !== null);
            client.db("Profilesdb").collection("Profile").insertMany(profiles);
        }

        //console.debug(profiles);

        console.log("[server] http://localhost:" + app.get("port"));
    } catch (error) {
        console.error("Kan niet connecten met database:", error);
    }
});