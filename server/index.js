require('dotenv').config();

const Sequelize = require('sequelize');
const express = require('express');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const userRoutes = require('../routes/Users');
const models = require('../database-mysql');

const {
  getMarketsInfo,
  getUserCoordinates,
  getRecipes,
} = require('./apiHelpers');

const { Op } = Sequelize;

const app = express();
app.use(cors());
app.use(bodyParser.urlencoded({
  extended: true,
}));
app.use(bodyParser.json());
const PORT = process.env.PORT || 3000;

// serve the signup/login routes
app.use('/api', userRoutes);


app.post('/api/usdaResponse', (req, res) => {
  const {
    email,
  } = req.body;
  // query the database for the user with the input email
  return models.Users.findOne({
    where: {
      email,
    },
  })
    .then((foundUser) => {
      if (!foundUser) {
        return res.status(404).json('User not found');
      }
      // if the user exists:
      // foundUser is an object with the user info from the db; pass the zipcode to getMarketsInfo
      return getMarketsInfo(foundUser.zipcode)
        .then((marketInfo) => res.send(marketInfo))
        .catch((err) => console.error(err));
    });
});


app.post('/api/usercoords', (req, res) => {
  const {
    zipcode,
  } = req.body;
  return getUserCoordinates(zipcode)
    .then((userLocation) => {
      res.send(userLocation);
    })
    .catch((err) => console.error(err));
});

app.post('/api/localIngredients', (req, res) => {
  const {
    zipcode,
  } = req.body;
  return getUserCoordinates(zipcode)
    .then((userLocation) => {
      // userLocation in an object with the user's city, abbrv state and coordinates (an array)
      const {
        state,
      } = userLocation;
      return models.States.findAll({
        where: {
          ABBREVIATION: state,
        },
      })
        .then((stateObj) => {
          if (!stateObj) {
            return res.status(404).json('State not found');
          }
          // region is the state's region [CONTINUE HERE!!!!!!!!!!!!!!!!!!!!!]
          const {
            region,
          } = stateObj[0];
          function getMonthWord() {
            const dt = new Date();
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            return months[dt.getMonth()];
          }
          const month = getMonthWord();
          return models.Ingredients.findAll({
            where: {
              [month]: 1,
              region,
            },
          })
            .then((ingredients) => {
              // console.log(ingredients);
              res.send(ingredients);
            });
        })
        .catch((err) => console.error(err));
    });
});

app.post('/api/getFavRecipes', (req, res) => {
  models.Users.findOne({
    where: {
      id: req.body.id,
    },
    include: [
      models.favRecipes,
    ],
  })
    .then((usersRecipes) => {
      res.send(usersRecipes);
    })
    .catch((err) => console.error(err));
});

app.post('/api/recipes', (req, res) => {
  const recipeIngredient = Object.keys(req.body);
  return getRecipes(recipeIngredient)
    .then((recipesArr) => {
      res.send(recipesArr.data);
    })
    .catch((err) => console.error(err));
});

app.post('/api/saveFavRecipe', (req, res) => {
  // req.body is an array ([selectedRecipe's title, image_url, publisher, user's email])
  const [recipeName, imageUrl, publisher, id] = req.body;
  console.log(id);
  // find the model with the favorite recipe name or put the info in the table if it isn't there
  models.favRecipes.findOrCreate({
    where: {
      recipe_name: recipeName,
    },
    defaults: {
      recipe_name: recipeName,
      recipe_image: imageUrl,
      recipe_url: publisher,
    },
  })
    .then((user) => {
      console.log(user);
      // create a new entry in the join UserRecipes table
      const {
        dataValues,
      } = user[0];
      models.UsersRecipes.create({
        userId: id,
        recipeId: dataValues.id,
      })
        .then((recipes) => {
          console.log(recipes);
          res.send(201);
        });
    })
    .catch((err) => {
      console.error(err);
    });
});

app.post('/api/removeFavRecipe', (req, res) => {
  console.log('favRecipes endpoint!!!!', req.body);
  // req.body is an array ([recipe hyperlink , recipe name, recipe image, recipe id in the db])
  const [recipeUrl, recipeName, imageUrl, id] = req.body;
  // find the model with the favorite recipe name or put the info in the table if it isn't there
  models.UsersRecipes.destroy({
    where: {
      recipeId: id,
    },
  }).then(() => {
    models.favRecipes.destroy({
      where: {
        recipe_name: recipeName,
      },
      defaults: {
        recipe_name: recipeName,
        recipe_image: imageUrl,
        recipe_url: recipeUrl,
      },
    })
      .then(() => {
        res.send(201);
      });
  }).catch((err) => {
    console.error(err);
  });
});

app.get('/hotList', (req, res) => {
  models.hotList
    .then((hottestList) => {
      res.status(201).send(hottestList[0]);
    })
    .catch((err) => {
      console.error(err);
    });
});

// connection for recipe notes
app.post('/api/notes', (req, res) => {
  models.UsersRecipes.update(
    { notes: req.body.note },
    { where: { userId: req.body.userId, recipeId: req.body.recipeId } },
  )
    .then((result) => {
      res.status(201).send('saved your note');
    })
    .catch((err) => {
      console.log(err);
    });
});

app.get('/api/notes', (req, res) => {
  models.UsersRecipes.findAll({
    where: {
      userId: req.query.userId,
      recipeId: req.query.recipeId,
    },
  })
    .then((userInfo) => {
      console.log(userInfo[0].dataValues.notes);
      res.status(201).send(userInfo[0].dataValues.notes);
    })
    .catch((err) => console.error(err));
});

app.post('/api/groceryList', (req, res) => {
  models.groceryList.create({
    userId: req.body.id,
    ingredientId: req.body.ingredientId,
  })
    .then((result) => {
      // console.log(result);
      res.status(201).send('ingredient added');
    })
    .catch((err) => console.error(err));
});

app.get('/api/groceryList', (req, res) => {
  
  models.groceryList.findAll({
    where: {
      userId: req.query.id,
    },
  })
    .then((result) => {
      if (!result.length) {
        throw new Error('No items in DB');
      }
      const ingredientIds = [];
      result.forEach((ingredient) => {
        ingredientIds.push(ingredient.ingredientId);
      });

      return models.Ingredients.findAll({
        where: {
          id: {
            [Op.or]: ingredientIds,
          },
        },
      });
    })
    .then((result) => {
      // console.log(result);
      res.status(200).send(result);
    })
    .catch((err) => {
      if (err.message === 'No items in DB') {
        res.status(204).send('No items in DB');
      } else {
        console.error(err)
        res.status(500);
      }
    });
});

app.post('/api/removeGroceries', (req, res) => {
  console.log(req.body, 'remove Groceries');
  const { Op } = Sequelize;
  models.groceryList.destroy({
    where: {
      userId: req.body.userId,
      ingredientId: {
        [Op.or]: req.body.ingredientIds,
      },
    },
  }).then(() => {
    res.send(201);
  }).catch((err) => {
    console.error(err);
  });
});

app.use(express.static(path.join(__dirname, '/../react-client/public')));
app.use(express.static(path.join(__dirname, '/../react-client/dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '/../react-client/dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`Hey im listening on port ${PORT}!`);
});
