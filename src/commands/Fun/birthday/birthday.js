const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const schedule = require('node-schedule');

const errorEmbed = new MessageEmbed()
    .setColor('#ff4646')
    .setDescription(`⛔ | Looks like you've already set your birthday!`);

module.exports = {
    run(client, interaction, db) {
        const collection = db.collection('birthdays');

        const birthdayData = { 
            userID: interaction.member.user.id, 
            day: interaction.options.getInteger('day'), 
            month: parseInt(interaction.options.getString('month'))
        };

        const schedulingRule = new schedule.RecurrenceRule();
        schedulingRule.minute = 0;
        schedulingRule.hour = 0;
        schedulingRule.date = birthdayData.day;
        schedulingRule.month = birthdayData.month;
        
        console.log(birthdayData, schedulingRule);

        collection.findOne(
            { userID: interaction.member.user.id },

            function (err, result) {
                if (err) console.log(err);
                console.log(result);

                if (result == null) {
                    collection.insertOne(birthdayData, function (err, result) {
                        if (err) console.log(err);
                        console.log(result);

                        const job = schedule.scheduleJob(schedulingRule, function () {
                            let channel = client.channels.cache.get('984869047256645632');
                            const birthdayEmbed = new MessageEmbed()
                                .setTitle(`bday`)
                                .setDescription('🎈🎆🎇✨🎉🎊');

                            channel.send({ embeds: [birthdayEmbed] });
                        });

                        console.log(job.nextInvocation());
                    });
                } else {
                    interaction.reply({ embeds: [errorEmbed] });
                }
            }
        );
    },
    config: new SlashCommandBuilder()
        .setName('birthday')
        .setDescription('Sets your birthday.')
        .addIntegerOption(option =>
            option.setName('day')
                .setDescription('A day.')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('month')
                .setDescription('A month.')
                .setRequired(true)
                .addChoices(
                    { name: 'January', value: '0' },
                    { name: 'February', value: '1' },
                    { name: 'March', value: '2' },
                    { name: 'April', value: '3' },
                    { name: 'May', value: '4' },
                    { name: 'June', value: '5' },
                    { name: 'July', value: '6' },
                    { name: 'August', value: '7' },
                    { name: 'September', value: '8' },
                    { name: 'October', value: '9' },
                    { name: 'November', value: '10' },
                    { name: 'December', value: '11' },
                )
        )    
};