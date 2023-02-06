const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const compressImage = require('compress-images');
const { createWorker, PSM } = require('tesseract.js');
const Emitter = require('events');
const fs = require('fs');
const request = require('request');

const matchesArray = ['Imperial Circus Dead Decadence', 'Provided by iBancho'];
const badMatchesArray = ['Cannot log in', 'not log in', 'Wrong name ot password', 'wrong name', 'empty response'];
const colorsDict = { 'success': '#99ec00', 'fail': '#ff4646' };

const accessDeniedEmbed = new MessageEmbed()
    .setColor('#ff4646')
    .setDescription('⛔ **| Your account is already in my database.**');

async function run(client, interaction, db) {
    const sourceImagePath = `./media/account_screenshots/${interaction.user.id}droid_screenshot.jpg`;
    const outputImagePath = `./media/account_screenshots/compressed`;
    const screenshot = await interaction.options.getAttachment('screenshot').url;
    const channel = await client.channels.fetch(interaction.channelId);
    const logsChannel = await client.channels.fetch('943228726311788584');
    const usernameCollection = await db.collection('droidUsernames');
    const reportEmbed = new MessageEmbed();

    var recognizingProgressCounter = 0;
    var report = {
        'userID': interaction.user.id,
        'username': interaction.user.tag,
        'droidUsername': interaction.options.getString('username').substring(0, 14),
        'screenshotLink': screenshot,
        'recognizedText': '',
        'verdict': '',
        'reason': 'everything is ok'
    };

    const databaseCheckedEmitter = new Emitter();
    const imageCompressedEmitter = new Emitter();

    await interaction.deferReply();
    await usernameCollection.find({ userID: interaction.user.id }).toArray((err, result) => {
        if (err) console.log(err);

        if (result.length != 0) {
            return interaction.editReply({ embeds: [accessDeniedEmbed] });
        } else {
            usernameCollection.find({ 
                username: interaction.options.getString('username')
            }).toArray((err, result) => {
                if (err) console.log(err);

                if (result.length != 0) {
                    return interaction.editReply({ embeds: [accessDeniedEmbed] });
                } else {
                    databaseCheckedEmitter.emit('checked');
                }
            });
        }
    });

    databaseCheckedEmitter.on('checked', function () {
        request.head(screenshot, function (err, response, body) {
            if (err) throw err;
            request(screenshot)
                .pipe(fs.createWriteStream(sourceImagePath))
                .on('close', function () {
                    compressImage(sourceImagePath, outputImagePath,
                        { compress_force: false, statistic: true, autoupdate: true }, false,
                        { jpg: { engine: 'mozjpeg', command: ['-quality', '60'] } },
                        { png: { engine: 'pngquant', command: ['--quality=20-50', '-o'] } },
                        { svg: { engine: 'svgo', command: '--multipass' } },
                        { gif: { engine: 'gifsicle', command: ['--colors', '64', '--use-col=web'] } },

                        function (error, completed, statistic) {
                            fs.unlink(sourceImagePath, function () { });

                            imageCompressedEmitter.emit('compressed');
                        }
                    );
                });
        });
    });

    imageCompressedEmitter.on('compressed', async function () {
        await interaction.editReply({ content: `🕓 **| Проверяю твой скриншот (подожди несколько секунд)...**` });

        await channel.send('❔ **| Статус: ...**').then(async (msg) => {
            const recognizePath = outputImagePath + interaction.user.id + 'droid_screenshot.jpg';
            const tesseract = await createWorker({
                logger: m => {
                    console.log(m.progress);

                    if (recognizingProgressCounter % 45 == 0 || m.progress == 1) {
                        msg.edit(`❔ **| Статус:** *${m.status}* **(*${m.progress * 100}%*).**`);
                    }

                    recognizingProgressCounter++;
                }
            });

            await tesseract.loadLanguage('eng');
            await tesseract.initialize('eng');
            await tesseract.setParameters({
                tessedit_pageseg_mode: PSM.SPARSE_TEXT
            });

            await tesseract.recognize(recognizePath).then(async ({ data: { text } }) => {
                report.recognizedText = text;
                console.log(text);

                databaseCheckedEmitter.off('checked', function () {});
                imageCompressedEmitter.off('compressed', function () { });
                fs.unlink(outputImagePath + interaction.user.id + 'droid_screenshot.jpg', function () { });

                if (matchesArray.every(match => text.includes(match)) && text.includes(report.droidUsername)) {
                    report.verdict = 'success';

                    await interaction.member.roles.add('1003389088960893058');

                    await usernameCollection.insertOne(
                        {
                           userID: interaction.user.id,
                           username: interaction.options.getString('username')
                        },

                        function (err, result) {
                            if (err) console.log(err);
                            console.log(result);
                        }
                    );

                    await msg.reply('✅ **| Все в порядке! Ты верифицирован.**');
                } else {
                    report.verdict = 'fail';

                    if (badMatchesArray.some(badMatch => text.includes(badMatch))) {
                        report.reason = 'not logged in?';
                    } else if (!text.includes(report.droidUsername)) {
                        report.reason = 'wrong username / not logged in?';
                    } else {
                        report.reason = 'screenshot is not related to osu!droid at all (or wrong map)?';
                    }

                    await msg.reply('❎ **| Проверка не удалась. Убедись в том, что сделал всё согласно инструкции.**');
                }

                reportEmbed.setTitle('🧾 | Verification results log')
                    .setColor(colorsDict[report.verdict])
                    .setImage(report.screenshotLink)
                    .addFields(
                        { name: '**User:**', value: `<@!${report.userID}> (*${report.username}*)` },
                        { name: '**Droid username:**', value: report.droidUsername },
                        { name: '**Recognized text:**', value: `\`${report.recognizedText}\`` },
                        { name: '**Verdict:**', value: `${report.verdict} (*reason: ${report.reason}*)` }
                    )
                    .setFooter({ text: 'nika.bot', iconURL: client.user.displayAvatarURL() })
                    .setTimestamp();

                logsChannel.send({ embeds: [reportEmbed] });

                msg.delete();
                interaction.deleteReply();
                tesseract.terminate();
            });
        });
    });
}

const config = new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verify yourself to get access to the server.')
    .addStringOption(option =>
        option.setName('username')
            .setDescription('Your osu!droid username.')
            .setRequired(true)
    ).addAttachmentOption(option =>
        option.setName('screenshot')
            .setDescription('A pic of droid homescreen with your account logged in.')
            .setRequired(true)
    );

module.exports = { run, config };