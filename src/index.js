const { Client, Intents, Collection } = require('discord.js');
const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');
const fs = require('node:fs');
const os = require('node:os');

dotenv.config();

const client = new Client({ 
    intents: [
        Intents.FLAGS.GUILDS,
        Intents.FLAGS.GUILD_MEMBERS,
        Intents.FLAGS.GUILD_MESSAGES,
        Intents.FLAGS.GUILD_BANS
    ]
});

const mongoClient = new MongoClient("mongodb://127.0.0.1:27017/");
const db = mongoClient.db('nikabotdb');

async function botStart() {
    try {
        await mongoClient.connect();
        console.log('~ database: ok');

        await client.login(process.env.TOKEN);
        console.log('~ client: ok');
    } catch (err) {
        console.log(err);
    }
}

client.commands = new Collection();

fs.readdir('./commands', (err, folders) => {
    folders.forEach((folder) => {
        fs.readdir(`./commands/${folder}`, (err, subfolders) => {
            subfolders.forEach((subfolder) => {
                const command = require(`./commands/${folder}/${subfolder}/${subfolder}.js`);
                client.commands.set(command.config.name, command);
            });
        });
    });
});

client.once('ready', () => {
    setInterval(() => {
        const memUsed = Math.round((os.totalmem() - os.freemem()) / os.totalmem() * 100);
        const platform = os.platform();

        const status = `${platform} [${memUsed}%]`;

        client.user.setActivity(status, { type: 'PLAYING' });
    }, 10000);
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) return;

    try {
        await command.run(client, interaction, db);
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: 'Something went wrong!', ephemeral: true });
    }
});

botStart();