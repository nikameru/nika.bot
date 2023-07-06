const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed, MessageButton, MessageActionRow, MessageAttachment } = require('discord.js');
const { Accuracy, MapInfo, MapStats } = require('@rian8337/osu-base');
const { 
    DroidDifficultyCalculator,
    DroidPerformanceCalculator,
    OsuDifficultyCalculator,
    OsuPerformanceCalculator
} = require('@rian8337/osu-difficulty-calculator');
const { renderOsuDroidRankGraph } = require('../../../utils/rankGraph/rankGraph.js');
const { getRecentPlays } = require('../../../utils/droidApi/droidApi.js');
const Emitter = require('events');
const http = require('http');
const { stripIndents } = require('common-tags');
const dayjs = require('dayjs');
const { some } = require('vega-lite');

const requestOptions = {
    host: 'beta.acivev.de',
    path: ''
};

const requestDataObtainedEmitter = new Emitter();
const droidGraphRenderedEmitter = new Emitter();

const accessDeniedEmbed = new MessageEmbed()
    .setColor('#ff4646')
    .setDescription('⛔ **| Your discord/droid account is already in my database.**');

const somethingWentWrongEmbed = new MessageEmbed()
    .setColor('#ff4646')
    .setDescription('❌ **| Something went wrong.**');

const uidNotSpecifiedEmbed = new MessageEmbed()
    .setColor('#ff4646')
    .setDescription(
        '⛔ **| Please bind your droid account via __/droid userbind__ first or specify uid manually!**'
    );

const mapNotFoundEmbed = new MessageEmbed()
    .setColor('#ff4646')
    .setDescription(
        '❌ **| Unable to find the beatmap!**'
    );

const droidAccountBindedEmbed = new MessageEmbed()
    .setColor('#99ec00');

const droidProfileRow = new MessageActionRow()
    .addComponents(
        new MessageButton()
            .setCustomId('graphButton')
            .setLabel('View ranking graph')
            .setStyle('SECONDARY')
            .setEmoji('983444986873909289')
    );

function setDroidProfileStats(options, client, droidProfileEmbed) {
    const req = http.get(options, function (res) {
        console.log('~ STATUS: ' + res.statusCode);

        if (res.statusCode == 200) {
            const bodyChunks = [];

            res.on('data', function (chunk) {
                bodyChunks.push(chunk);
            }).on('end', function () {
                const body = Buffer.concat(bodyChunks);
                const statsJson = JSON.parse(body);

                console.log('~ BODY: ' + body);

                droidProfileEmbed.setTitle(`osu!droid profile`)
                    .setDescription(
                        `**🏅 | Rank: #${statsJson.globalRanking} (:flag_${statsJson.region.toLowerCase()}: #${statsJson.countryRanking})**` +
                        `\n\n**👌 | Accuracy: ${+(statsJson.overallAccuracy / statsJson.overallPlaycount / 1000).toPrecision(4)}%**`)
                    .setThumbnail('https://beta.acivev.de/api2/avatar/512/' + statsJson.id)
                    .setFooter({ text: 'nika.bot', iconURL: client.user.displayAvatarURL() })
                    .setTimestamp();

                requestDataObtainedEmitter.emit('requestDataObtained');
            })
        } else {
            return false;
        }
    });

    req.on('error', function (err) {
        console.log('~ ERROR: ' + err.message);
    });
}

async function run(client, interaction, db) {
    const subcommandName = await interaction.options.getSubcommand();
    const droidUsersCollection = await db.collection('droidUsersCollection');
    const droidUser = await droidUsersCollection.findOne({ userId: interaction.user.id });

    const droidProfileEmbed = new MessageEmbed()
        .setTitle('👤 | Profile')
        .setColor('#ff80ff');

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

        if (!setDroidProfileStats(requestOptions, client, droidProfileEmbed)) {
            return interaction.reply({ embeds: [somethingWentWrongEmbed] });
        }

        requestDataObtainedEmitter.once('requestDataObtained', function () {
            interaction.reply({ embeds: [droidProfileEmbed], components: [droidProfileRow] });

            const interactionFilter = i => i.customId == 'graphButton' && i.user.id == interaction.user.id;

            const buttonCollector = interaction.channel.createMessageComponentCollector({ interactionFilter, time: 15000 });

            buttonCollector.once('collect', i => {
                if (i.user.id == interaction.user.id) {
                    try {
                        renderOsuDroidRankGraph(interaction.user.id, droidId, droidGraphRenderedEmitter);
                    } catch {
                        return interaction.reply({ embeds: [somethingWentWrongEmbed] });
                    }

                    droidGraphRenderedEmitter.once('graphRendered', function () {
                        try {
                            const attachmentGraph = new MessageAttachment(
                                `../media/rank_graphs/graph.png`, 'graph.png'
                            );

                            droidProfileEmbed.setImage('attachment://graph.png');

                            i.update({ embeds: [droidProfileEmbed], files: [attachmentGraph] });
                        } catch (err) {
                            console.log(err);
                        }
                    });
                }
            });
        });
    } else if (subcommandName == 'recent') {
        const index = interaction.options.getInteger('index') ?? 1;
        const plays = await getRecentPlays(droidId, index, 1);
        const play = plays[0];

        const beatmapData = await MapInfo.getInformation(play.hash);

        if (!beatmapData) {
            return interaction.reply({ embeds: [mapNotFoundEmbed] });
        }

        const osuRating = new OsuDifficultyCalculator(beatmapData.beatmap).calculate();
        const droidRating = new DroidDifficultyCalculator(beatmapData.beatmap).calculate();

        const accuracy = new Accuracy({
            percent: parseFloat(play.accuracy),
            nobjects: beatmapData.objects
        });

        const stats = new MapStats({
            ar: beatmapData.ar,
            isForceAR: false,
            speedMultiplier: 1
        });

        const pp = new OsuPerformanceCalculator(osuRating.attributes).calculate({
            combo: play.combo,
            accPercent: accuracy,
            stats: stats
        });

        const dpp = new DroidPerformanceCalculator(droidRating.attributes).calculate({
            combo: play.combo,
            accPercent: accuracy,
            stats: stats
        });

        const timestamp = dayjs(play.date).unix();
        const rankingEmoji = client.emojis.cache.find(emoji => emoji.name == `${play.rank}_ranking`);

        const droidRecentEmbed = new MessageEmbed()
            .setTitle(`${play.title}`)
            .setColor('#ff80ff')
            .setDescription(stripIndents`
                [${rankingEmoji}] | ${play.score} | __**${dpp.total.toFixed(2)}dpp** - ${droidRating.total.toFixed(2)}__* (${pp.total.toFixed(2)}pp - ${osuRating.total.toFixed(2)}*)\n
                ${play.mods} | ${play.accuracy}% | ${play.combo}x | ${play.misscount} ❌ | <t:${timestamp}:R>  
            `)
            .setThumbnail(`https://b.ppy.sh/thumb/${beatmapData.beatmapsetID}l.jpg`)
            .setFooter({ text: 'from nikameru with 💜', iconURL: client.user.displayAvatarURL() })
            .setTimestamp();

        interaction.reply({ content: `✅ **| Recent play for __${droidId}__:**`, embeds: [droidRecentEmbed] });
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
    )
    .addSubcommand(subcommand =>
        subcommand.setName('profile')
            .setDescription('Your osu!droid statistics.')
            .addIntegerOption(option =>
                option.setName('uid')
                    .setDescription('User ID of the account.')
                    .setRequired(false)
            )
    )
    .addSubcommand(subcommand =>
        subcommand.setName('recent')
            .setDescription('Shows last osu!droid plays.')
            .addIntegerOption(option =>
                option.setName('uid')
                    .setDescription('User ID of the account.')
                    .setRequired(false)
            )
            .addIntegerOption(option =>
                option.setName('index')
                    .setDescription('Which play (from last to 50th) to show. Defaults to 1.')
                    .setMinValue(1)
                    .setMaxValue(50)
                    .setRequired(false)
            )
    );

module.exports = { run, config };