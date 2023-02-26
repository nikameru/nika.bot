const { SlashCommandBuilder, ActionRowBuilder } = require('@discordjs/builders');
const { MessageEmbed, MessageButton } = require('discord.js');
const { renderOsuDroidRankGraph } = require('../../../utils/rankGraph/rankGraph.js');
const Emitter = require('events');
const http = require('http');

const requestOptions = {
    host: 'beta.acivev.de',
    path: ''
};

const requestDataObtainedEmitter = new Emitter();

const accessDeniedEmbed = new MessageEmbed()
    .setColor('#ff4646')
    .setDescription('⛔ **| Your discord/droid account is already in my database.**');

const uidNotSpecifiedEmbed = new MessageEmbed()
    .setColor('#ff4646')
    .setDescription(
        '⛔ **| Please bind your droid account via __/droid userbind__ first or specify uid manually!**'
    );

const droidAccountBindedEmbed = new MessageEmbed()
    .setColor('#99ec00');

const droidProfileEmbed = new MessageEmbed()
    .setTitle('👤 | Profile')
    .setColor('#ff80ff');

const droidProfileRow = new ActionRowBuilder()
    .addComponents(
        new MessageButton()
            .setCustomId('graphButton')
            .setLabel('View ranking graph')
            .setStyle('PRIMARY')
            .setEmoji('1079336136343818302')
    );

function setDroidProfileStats(options, client, interaction) {
    const req = http.get(options, function (res) {
        console.log('~ STATUS: ' + res.statusCode);

        const bodyChunks = [];

        res.on('data', function (chunk) {
            bodyChunks.push(chunk);
        }).on('end', function () {
            const body = Buffer.concat(bodyChunks);
            const statsJson = JSON.parse(body);

            console.log('~ BODY: ' + body);
    
            droidProfileEmbed.setTitle(`osu!droid profile`)
                .setDescription(
                    `**🏅 | Rank: #${statsJson.globalRanking} (:flag_${statsJson.region.toLowerCase()}: #${statsJson.countryRanking})**\n
                    **👌 | Accuracy: ${+(statsJson.overallAccuracy / statsJson.overallPlaycount / 1000).toPrecision(4)}%**`)
                .setThumbnail('https://beta.acivev.de/api2/avatar/512/' + statsJson.id)
                .setFooter({ text: 'nika.bot', iconURL: client.user.displayAvatarURL() })
                .setTimestamp();

            requestDataObtainedEmitter.emit('requestDataObtained');
        })
    });

    req.on('error', function (err) {
        console.log('~ ERROR: ' + err.message);
    });
}

async function run(client, interaction, db) {
    const subcommandName = await interaction.options.getSubcommand();
    const droidUsersCollection = await db.collection('droidUsersCollection');
    const droidUser = await droidUsersCollection.findOne({ userId: interaction.user.id });
    var droidId;

    if (droidUser == null && interaction.options.getInteger('uid') == null) {
        return interaction.reply({ embeds: [uidNotSpecifiedEmbed] });
    } else if (droidUser == null || interaction.options.getInteger('uid') != null) {
        droidId = interaction.options.getInteger('uid');
    } else {
        droidId = droidUser.droidId;
    }

    if (subcommandName == 'userbind') {
        await droidUsersCollection.find({ userId: interaction.user.id }).toArray((err, result) => {
            if (err) console.log(err);
            
            if (result.length != 0) {
                return interaction.reply({ embeds: [accessDeniedEmbed] });
            } else {
                droidUsersCollection.find({
                    droidId: droidId
                }).toArray((err, result) => {
                    if (err) console.log(err);

                    if (result.length != 0) {
                        return interaction.reply({ embeds: [accessDeniedEmbed] });
                    } else {
                        droidUsersCollection.insertOne(
                            {
                                userId: interaction.user.id,
                                droidId: droidId,
                                bindingDate: Date.now()
                            },

                            function (err, result) {
                                if (err) console.log(err);
                                console.log(result);

                                droidAccountBindedEmbed.setDescription(
                                    `**✅ | Successfully binded ${droidId} to ${interaction.user}!**`
                                );

                                interaction.reply({ embeds: [droidAccountBindedEmbed] });
                            }
                        );
                    }
                });
            }
        });
    } else if (subcommandName == 'profile') {
        requestOptions.path = '/api/profile/stats/' + droidId;

        setDroidProfileStats(requestOptions, client, interaction);

        requestDataObtainedEmitter.once('requestDataObtained', function () {
            interaction.reply({ embeds: [droidProfileEmbed] });
        });
    }
}

const config = new SlashCommandBuilder()
    .setName('droid')
    .setDescription('List of osu!droid commands.')
    .addSubcommand(subcommand =>
        subcommand.setName('userbind')
            .setDescription('Bind your osu!droid account to the bot!')
            .addIntegerOption(option => 
                option.setName('uid')
                    .setDescription('User ID of the account.')
                    .setRequired(true)
            )
    ).addSubcommand(subcommand =>
        subcommand.setName('profile')
            .setDescription('Your osu!droid statistics.')
            .addIntegerOption(option =>
                option.setName('uid')
                    .setDescription('User ID of the account.')
                    .setRequired(false)
            )
    );

module.exports = { run, config };