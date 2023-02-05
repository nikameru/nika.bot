const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const { token } = require('./config.json');
const fs = require('node:fs');
const rest = new REST({ version: '9' }).setToken(token);
const commands = [];
const cid = '638829884256288778';
const gid = '942861116164411443';

async function commandsDeploy (commands) {
    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(Routes.applicationGuildCommands(cid, gid), { body: commands });

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
};

fs.readdir('./commands', (err, folders) => {
    if (err) console.log(err);

    folders.forEach((folder, i) => {
        console.log(folder);

        fs.readdir(`./commands/${folder}`, (err, sfolders) => {
            if (err) console.log(err);

            let sfoldersNum = sfolders.length - 1;

            sfolders.forEach((sfolder, i) => {
                console.log(sfolder);

                const command = require(`./commands/${folder}/${sfolder}/${sfolder}`);

                if (command.config.name) {
                    commands.push(command.config);
                } else {
                    commands.push(command.config.toJSON());
                }

                console.log(sfoldersNum, i);

                if (sfoldersNum == i) {
                    commandsDeploy(commands);
                }
            });
        });
    });
});

/*fs.readdir('./commands', (err, folders) => {
    folders.forEach((folder) => {
        console.log(folder);
        var commandFiles = fs.readdirSync(`./commands/${folder}`).filter(file => file.endsWith('.js'));
        for (const file of commandFiles) {
            const command = require(`./commands/${folder}/${file}`);
            console.log(command.config);
            commands.push(command.config);
        }
    });

    commandsDeploy(commands);
});*/