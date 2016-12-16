# Caring Challenge Bot

## Problem
After Actively Caring sessions we see students filled with energy to create a better environment for
them and their peers. However it's difficult to find a concrete and reliable outlet for this new
found energy. Some students attempt to organize large projects while others see it fade. We'd like
to give every student the ability to easily sustain this drive with the hope of it becoming a habit.

## What's the idea?
We'd like to give students an easy way to maintain the momentum after a session by giving them tools
to encourage [Actively Caring](http://ac4p.org/about) and hold themselves and others accountable to
making it a daily habit. It's posed as a "challenge" that includes both social and individual game
mechanics to keep students engaged.

This project is a [Telegram](https://telegram.org) messaging bot that serves as a product we can
dogfood and iterate on. It mimics the types of notifications and interactions we imagine students
would be engaged with and allows participants to experiment with rules along the way.

## What does it do?
There are many moving parts and experiments that will happen over the coming weeks but at its core
the bot is repsonsible for:

- Organizing and managing teams
- Maintaining a list of "actively caring" deeds (e.g. "give a compliment to a friend")
- Provide a small subset of those listings to participants every day
- Allow participants to record which deeds were completed
- Provide social and individual game mechanics around completing deeds (congratulatory messages,
  streaks, encouragement, etc.)

For more information on the organization making this happen visit [AC4P](http://www.ac4p.org/)

# Development
## Setup
The project uses TypeScript/Node.js and requires a couple of dependencies to get started:

```
npm install -g ts-node typescript nodemon
npm install
```

## Running
```
npm run build:live
```

