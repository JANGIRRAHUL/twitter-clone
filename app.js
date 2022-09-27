const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const databasePath = path.join(__dirname, "twitterClone.db");

const app = express();
app.use(express.json());

let database = null;

const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is running at: http://localhost:3000/");
    });
  } catch (error) {
    console.log(`Db Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (authHeader === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "SECRET", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

const validatePassword = (password) => {
  return password.length >= 6;
};

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const databaseUser = await database.get(selectUserQuery);

  if (databaseUser === undefined) {
    const createUser = `
        INSERT INTO
        user (username, password, name, gender)
        VALUES 
        (
            '${username}',
            '${hashedPassword}',
            '${name}',
            '${gender}'
        )
        `;
    if (validatePassword(password)) {
      await database.run(createUser);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserDetails = `
    SELECT *
    FROM user
    WHERE username = '${username}';
    `;
  const getUser = await database.get(getUserDetails);

  if (getUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const passwordMatched = await bcrypt.compare(password, getUser.password);
    if (passwordMatched) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "SECRET");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const convertDbObjectToResponseObject = (dbObject) => {
  return {
    username: dbObject.username,
    tweet: dbObject.tweet,
    dateTime: dbObject.date_time,
  };
};

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  let { username } = request.body;
  console.log(username);
  let userId = `SELECT user_id FROM user WHERE username = '${username}';`;
  let userObj = await database.get(userId);
  console.log(userObj);
  const getTweetsFeed = `
    SELECT 
    user.username AS username, tweet.tweet AS tweet, tweet.date_time AS dateTime
    FROM
    follower
    INNER JOIN tweet
    ON follower.following_user_id = tweet.user_id
    INNER JOIN user
    ON tweet.user_id = user.user_id
    WHERE 
    follower.follower_user_id = ${userObj.user_id}
    ORDER BY 
    tweet.date_time DESC
    LIMIT 4;
    `;
  const getTweetsArray = await database.all(getTweetsFeed);
  response.send(getTweetsArray);
});

app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request.body;
  console.log(username);
  let userId = `SELECT user_id FROM user WHERE username = '${username}';`;
  let userObj = await database.get(userId);
  console.log(userObj);
  const getFollowings = `
    SELECT 
    user.name AS name
    FROM
    follower
    INNER JOIN user
    ON follower.following_user_id = user.user_id
    WHERE 
    follower.follower_user_id = ${userObj.user_id}
    `;
  const getFollowingsArray = await database.all(getFollowings);
  response.send(getFollowingsArray);
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request.body;
  console.log(username);
  let userId = `SELECT user_id FROM user WHERE username = '${username}';`;
  let userObj = await database.get(userId);
  console.log(userObj);
  const getFollowers = `
    SELECT 
    user.name AS name
    FROM
    follower
    INNER JOIN user
    ON follower.follower_user_id = user.user_id
    WHERE 
    follower.following_user_id = ${userObj.user_id}
    `;
  const getFollowersArray = await database.all(getFollowers);
  response.send(getFollowersArray);
});

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request.body;
  let userId = `SELECT user_id FROM user WHERE username = '${username}';`;
  let userObj = await database.get(userId);
  console.log(userObj);

  const getTweetsFeed = `
    SELECT *
    FROM
    follower
    INNER JOIN tweet
    ON follower.following_user_id = tweet.user_id
    INNER JOIN user
    ON tweet.user_id = user.user_id
    WHERE 
    follower.follower_user_id = ${userObj.user_id} AND tweet.tweet_id = ${tweetId}
    `;
  const getTweetsArray = await database.all(getTweetsFeed);
  console.log(getTweetsArray);
  response.send(getTweetsArray);
});

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request.body;
    const getFollowing = `
    SELECT username AS "profileName",following_user_id AS "id"
    FROM (user LEFT JOIN follower ON user.user_id = follower.following_user_id) AS T1 
    WHERE user.username = '${username}';
    `;
    const userIdArray = await database.all(getFollowing);

    const getUserId = `
  SELECT user_id
  FROM tweet
  WHERE tweet_id = ${tweetId};
  `;
    const userId = await database.get(getUserId);

    let follow = false;

    for (let value of userIdArray) {
      follow = value.id === userId.user_id;
    }
    if (follow) {
      const selectUserQuery = `
    SELECT user_id AS "id"
    FROM like
    WHERE tweet_id = ${tweetId};
    `;
      const userQuery = await database.all(selectUserQuery);
      let nameArray = [];

      for (let value of userQuery) {
        const selectFollowersName = `
        SELECT username
        FROM user
        WHERE user_id = ${value.id};
        `;
        const nameOfFollower = await database.get(selectFollowersName);
        nameArray.push(nameOfFollower.username);
      }
      response.send({ likes: nameArray });
    } else {
      response.status(400);
      response.send("Invalid Request");
    }
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request.body;
    const getFollowing = `
    SELECT username AS "profileName",following_user_id AS "id"
    FROM (user LEFT JOIN follower ON user.user_id = follower.following_user_id) AS T1 
    WHERE user.username = '${username}';
    `;
    const userIdArray = await database.all(getFollowing);

    const getUserId = `
  SELECT user_id
  FROM tweet
  WHERE tweet_id = ${tweetId};
  `;
    const userId = await database.get(getUserId);

    let follow = false;

    for (let value of userIdArray) {
      follow = value.id === userId.user_id;
    }
    if (follow) {
      const selectUserQuery = `
    SELECT reply,user_id AS "id"
    FROM reply
    WHERE tweet_id = ${tweetId};
    `;
      const userQuery = await database.all(selectUserQuery);
      let nameArray = [];

      for (let value of userQuery) {
        const selectFollowersName = `
        SELECT name
        FROM user
        WHERE user_id = ${value.id};
        `;
        const nameOfFollower = await database.get(selectFollowersName);
        console.log(value.reply);
        nameArray.push({ name: nameOfFollower.name, reply: value.reply });
      }
      response.send({ replies: nameArray });
    } else {
      response.status(400);
      response.send("Invalid Request");
    }
  }
);

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request.body;
  const selectUserQuery = `
    SELECT tweet AS "tweet", count(like_id) AS "likes", count(reply_id) AS "replies", date_time AS dateTime
    FROM user INNER JOIN tweet ON user.user_id = tweet.user_id 
    INNER JOIN reply ON tweet.user_id = reply.user_id 
    INNER JOIN like ON reply.user_id = like.user_id
    WHERE user.username = '${username}'
    GROUP BY tweet;
    `;
  const getDetails = await database.all(selectUserQuery);
  response.send(getDetails);
});

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweetId, tweet, userId, dateTime } = request.body;
  const createUserQuery = `
    INSERT INTO
    tweet (tweet_id,tweet,user_id,date_time)
    VALUES
    (
        ${tweetId},
        '${tweet}',
        ${userId},
        '${dateTime}'
    );
    `;
  await database.run(createUserQuery);
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request.body;
    const selectUserQuery = `
    SELECT username
    FROM user INNER JOIN tweet ON user.user_id = tweet.user_id
    WHERE tweet.tweet_id = ${tweetId};
    `;
    const getUsername = await database.get(selectUserQuery);
    if (getUsername.username === username) {
      const deleteUserQuery = `
        DELETE FROM 
        tweet
        WHERE tweet_id = ${tweetId};
        `;
      await database.run(deleteUserQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
