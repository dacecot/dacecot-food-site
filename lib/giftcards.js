/* ============================================================
   da Cecot — the gift card catalogue (Gift Cards page).

   Source: Erika's "Gift Card Web Developer Handoff" (Sept 2026). The website
   is the catalogue; Square sells and delivers the eGift card. Every button
   goes to the ONE Square order page below — Square has no tested link that
   preselects a design or amount, so none is invented.

   Square eGift cards hold money, not products: the copy says what a value is
   meant for, never that it is restricted to it.

   Fixed-value cards carry `exact` amounts. Square's four preset buttons can't
   show $45 or $95, so before leaving for Square the guest is told the exact
   amount to type in. The two class prices are NOT typed here — they come from
   lib/orders/submission.js, the same constants the booking pages and the till
   use, so a price change cannot leave the gift card saying the old one.

   `ready: false` keeps a card off the page (artwork pending) without losing
   its copy. Flip it once the new image is in images/gift-cards/.
   ============================================================ */

const { CLASS_PRICE_CENTS, DROP_IN_PRICE_CENTS } = require('./orders/submission');

const SQUARE_GIFT_URL = 'https://app.squareup.com/gift/ML1Z8KZJ63H3K/order';

const dollars = (cents) => '$' + (cents / 100).toFixed(2).replace(/\.00$/, '');
const ERIKA = DROP_IN_PRICE_CENTS;   // Pasta con Erika = the Thursday drop-in
const SUNDAY = CLASS_PRICE_CENTS;    // La Domenica, Sunday class
const DINNER = 5500;                 // fixed dinner menu, per guest

const CARDS = [
  {
    slug: 'gift-for-your-table', ready: true,
    title: 'A Gift for Your Table', price: 'Choose your amount', value: 'flexible',
    desc: 'A flexible Da Cecot gift for any occasion. The recipient may use it toward dining, fresh pasta, sauces, retail products or an eligible pasta experience.',
    button: 'Choose Your Gift',
    alt: 'Da Cecot gift card: A Gift for Your Table — a golden bow-tie pasta on red.'
  },
  {
    slug: 'one-bag-fresh-pasta', ready: true,
    title: 'One Bag of Fresh Pasta', price: '$10', value: '$10', exact: ['$10'],
    desc: 'A simple gift made for their table. This $10 gift covers one package of Da Cecot classic fresh pasta, handmade in Edmonton using simple Italian ingredients. Filled pasta and specialty products may require an additional payment.',
    button: 'Gift One Bag',
    alt: 'Da Cecot gift card: One Bag of Fresh Pasta, $10 — a paper bag of rigatoni.'
  },
  {
    slug: 'pasta-and-sauce', ready: true,
    title: 'Pasta + Sauce', price: '$25', value: '$25', exact: ['$25'],
    desc: 'Everything needed to begin a comforting Italian meal at home. This $25 gift covers one package of Da Cecot classic fresh pasta and one jar of house-made tomato sauce. Filled pasta, premium sauces and additional products may require an additional payment.',
    button: 'Gift Pasta + Sauce',
    alt: 'Da Cecot gift card: Pasta + Sauce, $25 — a bag of farfalle and a jar of tomato sauce.'
  },
  {
    slug: 'happy-pasta-birthday', ready: true,
    title: 'Happy Pasta Birthday', price: 'From $10', value: 'from $10',
    desc: 'Celebrate their special day with the gift of pasta. The recipient may enjoy fresh pasta, handmade sauces, a meal at Da Cecot or an eligible pasta experience.',
    button: 'Send a Birthday Gift',
    alt: 'Da Cecot gift card: Happy Pasta Birthday — a bow-tie pasta with a birthday candle.'
  },
  {
    slug: 'pasta-for-two-anniversary', ready: true,
    title: 'Pasta for Two – Anniversary', price: 'From $25', value: 'from $25',
    desc: 'Celebrate love around the table. Choose an amount for two people to enjoy a Da Cecot dinner, fresh pasta to prepare at home or a shared pasta-making experience.',
    button: 'Send an Anniversary Gift',
    alt: 'Da Cecot gift card: Pasta for Two, Happy Anniversary — two bow-tie pastas and a heart.'
  },
  {
    slug: 'the-pasta-pantry', ready: true,
    title: 'The Pasta Pantry', price: '$50', value: '$50', exact: ['$50'],
    desc: 'Bring the taste of Da Cecot home. This gift is designed to cover approximately five packages of classic fresh pasta. Filled pasta, sauces and specialty products may cost more.',
    button: 'Gift the Pasta Pantry',
    alt: 'Da Cecot gift card: The Pasta Pantry — fresh pasta for home.'
  },
  {
    slug: 'pasta-con-erika', ready: true,
    title: 'Pasta con Erika', price: dollars(ERIKA) + ' per guest', value: dollars(ERIKA),
    exact: [dollars(ERIKA) + ' for one', dollars(ERIKA * 2) + ' for two'],
    desc: 'Give the experience of making fresh pasta with Erika. This gift includes one place in a welcoming, hands-on pasta-making session at Da Cecot. Beverages are not included. Advance reservation is required and sessions are subject to availability.',
    button: 'Gift Pasta con Erika',
    alt: 'Da Cecot gift card: Pasta con Erika, a hands-on pasta experience, ' + dollars(ERIKA) + ' per guest.'
  },
  {
    // Held: artwork still reads "DINNER TOGETHER" and shows no price.
    slug: 'dinner-at-da-cecot', ready: false,
    title: 'Dinner at Da Cecot', price: dollars(DINNER) + ' per guest / ' + dollars(DINNER * 2) + ' for two', value: dollars(DINNER),
    exact: [dollars(DINNER) + ' for one', dollars(DINNER * 2) + ' for two'],
    desc: 'Give the experience of gathering around the Da Cecot table. The fixed menu is valued at ' + dollars(DINNER) + ' per person and includes two appetizers, two pasta dishes and dessert. Beverages are excluded. Reservations are recommended.',
    button: 'Gift Dinner at Da Cecot',
    alt: 'Da Cecot gift card: Dinner at Da Cecot — a bowl of fresh pasta.'
  },
  {
    // Held: artwork needs "$95 PER GUEST" added.
    slug: 'sunday-pasta-class', ready: false,
    title: 'Sunday Pasta Class', price: dollars(SUNDAY) + ' per guest / ' + dollars(SUNDAY * 2) + ' for two', value: dollars(SUNDAY),
    exact: [dollars(SUNDAY) + ' for one', dollars(SUNDAY * 2) + ' for two'],
    desc: 'Give the full Da Cecot pasta-class experience. This gift includes a Sunday class where guests learn traditional techniques, prepare fresh pasta by hand and enjoy the experience around the table. Advance reservation is required and classes are subject to availability.',
    button: 'Gift a Sunday Pasta Class',
    alt: 'Da Cecot gift card: Sunday Pasta Class — learn, cook, share, belong.'
  }
];

module.exports = { SQUARE_GIFT_URL, CARDS, live: () => CARDS.filter((c) => c.ready) };
