const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const { pool } = require('./db');
const { schemaStatements } = require('./schema');

const adminSeedUsers = [
  { name: 'Avery Cole', email: 'admin1@folio.dev', password: 'AdminPass123!' },
  { name: 'Mina Hart', email: 'admin2@folio.dev', password: 'AdminPass123!' }
];

const customerSeedUsers = [
  { name: 'Liam Rivera', email: 'liam@folio.dev', password: 'Customer123!' },
  { name: 'Nora Blake', email: 'nora@folio.dev', password: 'Customer123!' },
  { name: 'Owen Patel', email: 'owen@folio.dev', password: 'Customer123!' }
];

const books = [
  {
    title: 'The Lantern Archive',
    author: 'Elena Voss',
    genre: 'Fiction',
    price: 18.99,
    original_price: 24.99,
    stock: 38,
    pages: 416,
    year: 2023,
    isbn: '978-1-4028-9462-1',
    emoji: '🏮',
    cover_color: '#2f3b73',
    featured: true,
    description: 'In a riverside city that archives forgotten memories instead of history, a cataloger discovers a lantern that can replay the most painful truths attached to a person or place. Her search for its origin pulls her through old family debts, a vanished printing house, and a corridor of quiet citizens who have learned to survive by editing their own pasts. The story blends intimate relationships, civic mystery, and the pressure of choosing what should remain hidden when truth finally asks to be seen.'
  },
  {
    title: 'Dune Circuit',
    author: 'Mason Pike',
    genre: 'Sci-Fi',
    price: 22.5,
    original_price: null,
    stock: 41,
    pages: 512,
    year: 2024,
    isbn: '978-1-4028-9462-2',
    emoji: '🛰️',
    cover_color: '#134e4a',
    featured: true,
    description: 'An orbital systems engineer is sent to stabilize a failing power lattice above a desert moon where every sandstorm scrambles the station\'s navigation AI. The job becomes a race against time once she discovers that the grid was built to hide a prison signal, not just to harvest energy. Sharp technical detail, corporate sabotage, and a stubborn sense of hope drive a story about what happens when infrastructure is also a weapon.'
  },
  {
    title: 'Glass Orchard',
    author: 'Sera Linden',
    genre: 'Fantasy',
    price: 21.75,
    original_price: 27.99,
    stock: 29,
    pages: 480,
    year: 2022,
    isbn: '978-1-4028-9462-3',
    emoji: '🍃',
    cover_color: '#5b4b8a',
    featured: true,
    description: 'Every spring, the fruit in the royal orchard turns to glass and sings the names of people the kingdom has forgotten. A courier with a damaged map and a talent for hearing magic is hired to deliver the last unbroken seed to a frontier village, but the road is crowded with oath-bound knights, market witches, and a prince who would rather lose a crown than admit what the orchard is protecting. It is a lush adventure about inheritance, wonder, and the cost of keeping a realm whole.'
  },
  {
    title: 'The Quiet Lock',
    author: 'Noah Vale',
    genre: 'Thriller',
    price: 16.49,
    original_price: 19.99,
    stock: 52,
    pages: 368,
    year: 2021,
    isbn: '978-1-4028-9462-4',
    emoji: '🔒',
    cover_color: '#7f1d1d',
    featured: false,
    description: 'A forensic locksmith receives a call from a hotel that has been locked from the inside for three days, even though guests keep checking in. As she traces the impossible chain of keys, she notices that every room contains a different version of the same missing family, and every witness seems to know what happened before the police arrive. The book leans into procedural tension, sharp reveals, and the dread of realizing a building can keep secrets better than people can.'
  },
  {
    title: 'After the Moonset',
    author: 'Iris Beaumont',
    genre: 'Romance',
    price: 14.99,
    original_price: null,
    stock: 64,
    pages: 320,
    year: 2024,
    isbn: '978-1-4028-9462-5',
    emoji: '🌙',
    cover_color: '#9d174d',
    featured: false,
    description: 'Two strangers inherit adjoining apartments in a coastal building scheduled for demolition, and the only thing they agree on is that neither wants to stay long enough to get attached. Their routines collide through shared laundry, late-night music, and a stubborn rooftop garden that keeps growing despite the cold wind. The novel builds from small gestures and honest conversations into a story about choosing a future when both people are used to leaving first.'
  },
  {
    title: 'Small Steps, Bright Days',
    author: 'Talia Reed',
    genre: 'Self-Help',
    price: 12.99,
    original_price: 16.99,
    stock: 88,
    pages: 256,
    year: 2020,
    isbn: '978-1-4028-9462-6',
    emoji: '🌤️',
    cover_color: '#166534',
    featured: false,
    description: 'This practical guide treats progress as a system rather than a mood, showing readers how to build routines that survive busy weeks, bad mornings, and the usual chaos of modern work. Through simple frameworks, reflection prompts, and examples grounded in everyday life, it argues that consistency grows faster when the plan is small enough to be done on a tired day. The tone is calm, direct, and useful instead of preachy.'
  },
  {
    title: 'Foundations of the River Empire',
    author: 'Dr. Julian Mercer',
    genre: 'History',
    price: 23.99,
    original_price: 28.99,
    stock: 24,
    pages: 544,
    year: 2019,
    isbn: '978-1-4028-9462-7',
    emoji: '🏛️',
    cover_color: '#78350f',
    featured: false,
    description: 'A sweeping, accessible history of a river civilization that rose through trade, flood management, and an unusually durable civic bureaucracy. The book follows how agricultural policy, sacred architecture, and transport networks shaped everything from taxation to food culture, while also explaining why the empire\'s decline lasted decades instead of ending in a single collapse. It reads like a patient conversation with a historian who cares deeply about context.'
  },
  {
    title: 'Steel Blossom',
    author: 'Ren Kisaragi',
    genre: 'Manga',
    price: 11.99,
    original_price: 14.99,
    stock: 72,
    pages: 208,
    year: 2023,
    isbn: '978-1-4028-9462-8',
    emoji: '🌸',
    cover_color: '#be185d',
    featured: true,
    description: 'In a city where factory districts bloom with engineered flowers that react to emotion, a mechanic discovers a vine of living steel growing through an abandoned train tunnel. The mystery escalates when a rival repair crew, a school science club, and an underground courier network all want the plant for different reasons. The pacing is brisk, the art direction is vivid, and the whole volume balances heart, style, and kinetic action.'
  },
  {
    title: 'Orbit of Ash',
    author: 'Calder Wynn',
    genre: 'Sci-Fi',
    price: 19.49,
    original_price: 25.99,
    stock: 33,
    pages: 448,
    year: 2022,
    isbn: '978-1-4028-9462-9',
    emoji: '☄️',
    cover_color: '#0f172a',
    featured: false,
    description: 'After an asteroid refinery breaks apart during a controlled burn, the station\'s damage report claims the disaster was accidental even though the debris pattern says otherwise. A salvage pilot, a linguist, and a burnt-out engineer must coordinate through sealed decks and unreliable telemetry while deciding whether their employer is hiding a mistake or a crime. The novel pairs hard-science tension with a bleak corporate atmosphere and a surprisingly tender human core.'
  },
  {
    title: 'The Last Summer Atlas',
    author: 'Mira Sol',
    genre: 'Fiction',
    price: 17.99,
    original_price: null,
    stock: 57,
    pages: 384,
    year: 2024,
    isbn: '978-1-4028-9462-10',
    emoji: '🗺️',
    cover_color: '#1d4ed8',
    featured: false,
    description: 'A cartographer nearing retirement receives one last assignment: document the unofficial road network of a summer archipelago before developers and storms erase it forever. Her route takes her through ferry towns, abandoned observatories, and family homes that only exist for a few months each year, forcing her to confront why she has spent decades mapping places she never stayed in. The book is reflective, warm, and full of carefully observed details about people and landscapes.'
  },
  {
    title: 'The Amber Verdict',
    author: 'Dorian Cross',
    genre: 'Thriller',
    price: 15.99,
    original_price: 18.99,
    stock: 46,
    pages: 352,
    year: 2020,
    isbn: '978-1-4028-9462-11',
    emoji: '⚖️',
    cover_color: '#991b1b',
    featured: false,
    description: 'A courthouse clerk finds an old evidence envelope containing a verdict that was never entered into the public record, and every person connected to the trial has since built a different life around the same missing truth. The investigation moves through archived phone logs, private security footage, and a town eager to preserve its version of events. The atmosphere is tense and procedural, with enough personal cost to keep the mystery grounded.'
  },
  {
    title: 'A Map for Two',
    author: 'Jenna Hartwell',
    genre: 'Romance',
    price: 13.99,
    original_price: 17.99,
    stock: 61,
    pages: 304,
    year: 2023,
    isbn: '978-1-4028-9462-12',
    emoji: '🧭',
    cover_color: '#be123c',
    featured: false,
    description: 'A travel illustrator and a city planner are assigned to design a neighborhood walking map, but they disagree on everything from the route to the landmarks that deserve attention. What begins as a practical partnership becomes an excuse to revisit old choices, family expectations, and the parts of home they have both tried to outgrow. The romance is slow, thoughtful, and built from the kind of trust that can only form when two people keep showing up.'
  },
  {
    title: 'The Seven Minute Reset',
    author: 'Priya Nair',
    genre: 'Self-Help',
    price: 10.99,
    original_price: 13.99,
    stock: 93,
    pages: 224,
    year: 2021,
    isbn: '978-1-4028-9462-13',
    emoji: '⏱️',
    cover_color: '#065f46',
    featured: false,
    description: 'This compact guide proposes a repeatable seven-minute ritual for regaining focus when a day starts to slip. It combines planning, attention resets, and realistic habit design into short routines that do not demand a complete life overhaul. Readers get examples for work, study, and home life, plus plain-language advice about how to recover after a bad week without abandoning the system entirely.'
  },
  {
    title: 'Harbor of Echoes',
    author: 'Marlowe Finch',
    genre: 'History',
    price: 20.99,
    original_price: null,
    stock: 28,
    pages: 472,
    year: 2018,
    isbn: '978-1-4028-9462-14',
    emoji: '⚓',
    cover_color: '#92400e',
    featured: false,
    description: 'This narrative history examines the rise of a port city that became powerful by turning weather, debt, and migration into a commercial advantage. Through shipping manifests, diary fragments, and political timelines, it shows how the harbor influenced language, labor, and architecture far beyond its coastline. The writing stays readable while still offering enough detail to satisfy readers who like history that feels lived in rather than merely summarized.'
  },
  {
    title: 'Moonlit Assembly',
    author: 'Aya Moriyama',
    genre: 'Manga',
    price: 12.49,
    original_price: 15.99,
    stock: 81,
    pages: 216,
    year: 2024,
    isbn: '978-1-4028-9462-15',
    emoji: '🌕',
    cover_color: '#6d28d9',
    featured: false,
    description: 'A student council that secretly meets under a train platform moonlight discovers that their school archives are being edited overnight by an invisible hand. The series mixes comic timing, emotional beats, and supernatural intrigue while each chapter reveals a different clue hidden in posters, uniforms, and handwritten notices. It has the momentum of a mystery and the warmth of a school ensemble story.'
  },
  {
    title: 'Tideglass',
    author: 'Rowan Quill',
    genre: 'Fantasy',
    price: 24.99,
    original_price: 29.99,
    stock: 21,
    pages: 528,
    year: 2023,
    isbn: '978-1-4028-9462-16',
    emoji: '🌊',
    cover_color: '#0ea5e9',
    featured: false,
    description: 'On an island where every tide leaves behind a thin layer of glass that remembers the voices of those who walked there, a tide-reader is asked to decode messages left by a drowned monarch. As the island\'s clans prepare for a ritual storm, the protagonist uncovers a history of bargains, lost names, and magic that depends on being witnessed. The book combines mythic scale with intimate local politics.'
  },
  {
    title: 'Night Ferry Overrun',
    author: 'Adrian Wolfe',
    genre: 'Thriller',
    price: 17.49,
    original_price: 21.99,
    stock: 39,
    pages: 336,
    year: 2024,
    isbn: '978-1-4028-9462-17',
    emoji: '🚢',
    cover_color: '#312e81',
    featured: false,
    description: 'Passengers aboard a midnight ferry wake to find the crew missing, the radios dead, and the vessel following a route that no chart lists. The trapped travelers must determine whether the ship has been hijacked, whether the navigation system has failed, or whether something far stranger is steering them into the fog. The novel delivers claustrophobic suspense, shifting alliances, and the constant threat of the water itself.'
  },
  {
    title: 'Letters to the Garden Wall',
    author: 'June Calder',
    genre: 'Romance',
    price: 15.25,
    original_price: null,
    stock: 54,
    pages: 288,
    year: 2022,
    isbn: '978-1-4028-9462-18',
    emoji: '💌',
    cover_color: '#db2777',
    featured: false,
    description: 'A baker who writes unsent letters to her late sister discovers that the man restoring the wall behind her shop has been hiding replies inside the bricks for years. The correspondence reveals a shared history of grief, missed chances, and the long process of learning how to begin again. The romance remains grounded in ordinary routines, warm conversation, and a convincing sense that healing can arrive quietly.'
  },
  {
    title: 'Daily Architecture',
    author: 'Hana Solis',
    genre: 'Self-Help',
    price: 9.99,
    original_price: 12.99,
    stock: 99,
    pages: 208,
    year: 2020,
    isbn: '978-1-4028-9462-19',
    emoji: '🏗️',
    cover_color: '#047857',
    featured: false,
    description: 'A concise, design-minded productivity book that treats the day like a structure to be built with attention, boundaries, and repeatable habits. Rather than promising dramatic transformation, it explains how small systems create stability at work and at home. The advice is organized, practical, and easy to revisit when life becomes noisy or the original plan stops fitting.'
  },
  {
    title: 'The Silent Standard',
    author: 'Elias North',
    genre: 'History',
    price: 26.99,
    original_price: 31.99,
    stock: 17,
    pages: 600,
    year: 2017,
    isbn: '978-1-4028-9462-20',
    emoji: '📜',
    cover_color: '#854d0e',
    featured: false,
    description: 'This book traces the hidden institutions behind a long-lived legal order, focusing on clerks, inspectors, and civic record-keepers rather than the usual headline leaders. It explains how standards spread through daily administration, how paperwork can outlast dynasties, and why systems feel invisible until they fail. The result is a thoughtful history of bureaucracy, governance, and the ordinary work that holds a society together.'
  }
];

const sampleReviews = [
  { bookIndex: 0, userIndex: 0, rating: 5, body: 'Beautifully written and quietly devastating in the best way.' },
  { bookIndex: 1, userIndex: 1, rating: 4, body: 'The setting feels technical and immersive without losing pace.' },
  { bookIndex: 2, userIndex: 2, rating: 5, body: 'The worldbuilding is lush and the emotional beats land hard.' },
  { bookIndex: 3, userIndex: 0, rating: 4, body: 'Tense, clean, and very hard to put down.' },
  { bookIndex: 4, userIndex: 1, rating: 4, body: 'A gentle romance with real warmth and excellent chemistry.' },
  { bookIndex: 5, userIndex: 2, rating: 5, body: 'Useful, grounded, and easy to apply immediately.' },
  { bookIndex: 6, userIndex: 0, rating: 4, body: 'Dense history made surprisingly approachable.' },
  { bookIndex: 7, userIndex: 1, rating: 5, body: 'Fast, stylish, and packed with energy.' }
];

async function ensureSchema(client) {
  for (const statement of schemaStatements) {
    await client.query(statement);
  }
}

async function seed() {
  const client = await pool.connect();
  try {
    for (const statement of schemaStatements) {
      await client.query(statement);
    }

    await client.query(`
      TRUNCATE TABLE
        order_items,
        orders,
        reviews,
        cart_items,
        wishlist_items,
        books,
        users
      RESTART IDENTITY CASCADE;
    `);

    const createdUsers = [];
    const allUsers = [
      ...adminSeedUsers.map((user) => ({ ...user, role: 'admin' })),
      ...customerSeedUsers.map((user) => ({ ...user, role: 'customer' }))
    ];

    for (const user of allUsers) {
      const passwordHash = await bcrypt.hash(user.password, Number(process.env.BCRYPT_ROUNDS || 12));
      const { rows } = await client.query(
        `INSERT INTO users (name, email, password_hash, role, avatar_url)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, email, role`,
        [
          user.name,
          user.email,
          passwordHash,
          user.role,
          `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(user.name)}`
        ]
      );
      createdUsers.push(rows[0]);
    }

    const createdBooks = [];
    for (const book of books) {
      const { rows } = await client.query(
        `INSERT INTO books (
          title,
          author,
          description,
          cover_url,
          cover_color,
          emoji,
          genre,
          price,
          original_price,
          stock,
          pages,
          year,
          isbn,
          featured
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id`,
        [
          book.title,
          book.author,
          book.description,
          `https://picsum.photos/seed/${encodeURIComponent(book.title)}/600/900`,
          book.cover_color,
          book.emoji,
          book.genre,
          book.price,
          book.original_price,
          book.stock,
          book.pages,
          book.year,
          book.isbn,
          book.featured
        ]
      );
      createdBooks.push(rows[0]);
    }

    for (const review of sampleReviews) {
      const book = createdBooks[review.bookIndex];
      const user = createdUsers[2 + review.userIndex];
      await client.query(
        `INSERT INTO reviews (book_id, user_id, rating, body)
         VALUES ($1, $2, $3, $4)`,
        [book.id, user.id, review.rating, review.body]
      );
    }

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);
    const formattedDate = futureDate.toISOString().split('T')[0];

    const samplePromotions = [
      {
        code: 'WELCOME10',
        description: '10% off your first order',
        discount_type: 'percentage',
        discount_value: 10,
        min_order_amount: 0,
        max_uses: null,
        expires_at: formattedDate,
        is_active: true
      },
      {
        code: 'BOOKWORM20',
        description: '20% off orders over $50',
        discount_type: 'percentage',
        discount_value: 20,
        min_order_amount: 50,
        max_uses: null,
        expires_at: formattedDate,
        is_active: true
      },
      {
        code: 'SAVE5',
        description: '$5 off orders over $30',
        discount_type: 'fixed',
        discount_value: 5,
        min_order_amount: 30,
        max_uses: null,
        expires_at: formattedDate,
        is_active: true
      }
    ];

    for (const promo of samplePromotions) {
      await client.query(
        `INSERT INTO promotions (code, description, discount_type, discount_value, min_order_amount, max_uses, expires_at, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          promo.code,
          promo.description,
          promo.discount_type,
          promo.discount_value,
          promo.min_order_amount,
          promo.max_uses,
          promo.expires_at,
          promo.is_active
        ]
      );
    }

    console.log(`Seeded ${createdUsers.length} users, ${createdBooks.length} books, ${sampleReviews.length} reviews, and ${samplePromotions.length} promotions.`);
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});