import express from 'express';
import bodyParser from 'body-parser';
import pg from 'pg'; 
import axios from 'axios';
import { user, host, password, database } from './config.js';


const app = express();
const port = 3000;
const API_URL = 'https://covers.openlibrary.org'

const db = new pg.Client({
  user,
  host,
  password,
  database,
    port: 5432
});

db.connect();

app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static('public'));

let books = [
    {
      id: 1,
      title: 'The Hobbit',
      olid: 'OL33891772M',
      date_read: '2023-11-16T16:00:00.000Z',
      review: 'This is a good book',
      rating: 6,
      book_id: 1
    },
    {
      id: 2,
      title: 'The Hired Girl',
      olid: 'OL27187262M',
      date_read: '2023-10-09T16:00:00.000Z',
      review: 'This book is very boring',
      rating: 2,
      book_id: 2
    }
  ];

  let sortType = 'date_read';
  let sortOrder = 'DESC';
  let idOrder = 'DESC';
  
  async function fetchCover(olid) {
    const response = await axios.get(`${API_URL}/b/olid/${olid}.json`);
        return response.data;
  }

  app.get("/", async (req, res) => {
    try {
      // Get book data from the database
        const result = await db.query(`SELECT * FROM book_info JOIN book_review ON book_info.id = book_review.book_id ORDER BY ${sortType} ${sortOrder}, book_id ${idOrder}`);
        books = result.rows;
      
      const fetchCoverPromises = books.map(async (book) => {
        return fetchCover(book.olid);
      });
      Promise.all(fetchCoverPromises)
      .then(cover_data=> {
        books.forEach((book, index)=> {
            book.coverURL = cover_data[index].source_url || `${API_URL}/b/olid/${book.olid}-M.jpg`;
        });
        res.render('index.ejs', {
            books: books
        })
      })
      .catch((error) => {
        console.error("Failed to fetch cover images:", error);
        // Handle error appropriately
      });
    } catch (err) {
        console.error("socket hang up:", err);
      console.log(err);
    }
  });

app.post("/sort", async (req, res) => {
    const order = req.body.order;

    switch(order) {
        //sort in date descending order
        case('date_descend'):
        sortType = 'date_read';
        sortOrder = 'DESC';
        idOrder = 'DESC';
        res.redirect('/');
        break;

        //sort in date ascending order
        case('date_ascend'):
        sortType = 'date_read';
        sortOrder = 'ASC';
        idOrder = 'ASC';
        res.redirect('/');
        break;

        //sort by rate descending
        case('rate_descend'):
        sortType = 'rating';
        sortOrder = 'DESC';
        idOrder = 'DESC';
        res.redirect('/');
        break;

        //sort by rate ascending
        case('rate_ascend'):
        sortType = 'rating';
        sortOrder = 'ASC';
        idOrder = 'DESC';
        res.redirect('/');
        break;

        //sort by title (Z-A)
        case('char_descend'):
        sortType = 'title';
        sortOrder = 'DESC';
        idOrder = 'DESC';
        res.redirect('/');
        break;

        //sort by title (A-Z)
        case('char_ascend'):
        sortType = 'title';
        sortOrder = 'ASC';
        idOrder = 'DESC';
        res.redirect('/');
        break;
    };
})

app.post("/add", async (req, res) => {
    const title = req.body.newTitle;
    const rating = req.body.newRating;
    const date_read = req.body.newDate_read;
    const olid = req.body.newOlid;
    const review = req.body.newReview;
    let notes = req.body.newNote; // Assign the value to a variable

    try {
      // Store book info to db
      const result = await db.query('INSERT INTO book_info (title, olid) VALUES ($1, $2) RETURNING id', [title, olid]);
      const id = result.rows[0].id;
      await db.query('INSERT INTO book_review (date_read, review, rating, book_id) VALUES ($1, $2, $3, $4)', [date_read, review, rating, id]);
      if (typeof notes === 'string') {
        notes = [notes]; // Convert the string to an array
      }
  
      for (const note of notes) {
        await db.query('INSERT INTO book_note (book_id, note) VALUES ($1, $2)', [id, note]);
      }
        res.redirect("/");

    } catch (err) {
        console.log(err);
    };
});

app.get('/detail/:id', async (req, res) => {
    const id = req.params.id;
    try {
      //get book info
        const book_result = await db.query('SELECT * FROM book_info JOIN book_review ON book_info.id = book_review.book_id WHERE book_info.id = $1', [id]);
        const book = book_result.rows;
        book[0].date_read.setUTCHours(book[0].date_read.getUTCHours() + 8); //adjust to HK time zone

        //get book notes
        const notes_result = await db.query('SELECT note FROM book_info JOIN book_note ON book_info.id = book_note.book_id WHERE book_info.id = $1', [id]);
        const notes = notes_result.rows;
        //fetch book cover
        const fetchCoverPromises = book.map(async (book) => {
            return fetchCover(book.olid);
          });
          Promise.all(fetchCoverPromises)
          .then(cover_data=> {
            book.forEach((book, index)=> {
                book.coverURL = cover_data[index].source_url || `${API_URL}/b/olid/${book.olid}-M.jpg`;
            });
            res.render('detail.ejs', {
                book: book,
                notes: notes
            })
          })
          .catch((error) => {
            console.error("Failed to fetch cover images:", error);
            // Handle error appropriately
          });
    } catch (err) {
        console.log(err);
    }
});

app.post('/edit/:book_id', async (req, res) => {
    const book_id = req.params.book_id;
    const updatedDate_read = req.body.updatedDate_read;
    const updatedRating = req.body.updatedRating;
    const updatedReview = req.body.updatedReview;
    const updatedNote = req.body.updatedNote;
    let newNote = req.body.newNote;

    try {
        await db.query('UPDATE book_review SET date_read = $1, rating = $2, review = $3 WHERE book_id = $4', [updatedDate_read, updatedRating, updatedReview, book_id]);

        const result = await db.query('SELECT id FROM book_note WHERE book_id = $1', [book_id]);
        const noteId = result.rows;

        for(let i = 0; i < noteId.length; i++) {
            await db.query(`UPDATE book_note SET note = $1 WHERE id = $2`, [updatedNote[i], noteId[i].id]);
        };

        if(newNote) {
            if (typeof newNote === 'string') {
                //Only one new Note
                newNote = [newNote];
            }

            for (const note of newNote) {
                await db.query('INSERT INTO book_note (book_id, note) VALUES ($1, $2)', [book_id, note]);
            }
        };
        //Delete all empty notes
        await db.query('DELETE FROM book_note WHERE TRIM(note) = $1', ['']);

        res.redirect('/detail/'+book_id);
    } catch (err) {
        console.log(err);
    };
});

app.post('/delete/:book_id', async (req, res) => {
    const book_id = req.params.book_id;
    try {
        //delete book
        await db.query('DELETE FROM book_review WHERE book_id = $1', [book_id]);
        await db.query('DELETE FROM book_note WHERE book_id = $1', [book_id]);
        await db.query('DELETE FROM book_info WHERE id = $1', [book_id]);
        console.log('Deleted')
        res.redirect('/');

    } catch (err) {
        console.log(err);
    };
});

app.post('/cancel/:book_id', (req, res) => {
  const book_id = req.params.book_id;
  res.redirect('/detail/'+book_id);
})

app.get("/new", (req, res) => {
  res.render('new.ejs');
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`)
});