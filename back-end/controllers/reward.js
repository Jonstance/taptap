const moment = require('moment');
const Earnings = require('../models/Earnings');

// Utility functions
const getSecondsOfDayUTC = (date = new Date()) => {
    const hours = date.getUTCHours();
    const minutes = date.getUTCMinutes();
    const seconds = date.getUTCSeconds();
    return hours * 3600 + minutes * 60 + seconds;
};

const findBatch = (date = new Date()) => {
    // Convert date to a native Date object if it's a Moment.js object
    if (moment.isMoment(date)) {
        date = date.toDate();
    }

    const totalSecondsInDay = 24 * 3600;
    const numberOfBatches = 8;
    const secondsPerBatch = totalSecondsInDay / numberOfBatches;
    const secondsOfDay = getSecondsOfDayUTC(date);
    return Math.floor(secondsOfDay / secondsPerBatch) + 1;
};


const getCurrentDateFormatted = () => {
    return moment.utc().format('YYYY-MM-DD');
};

const getRequiredScore = (minerLevel) => {
    const scoreMap = {
        1: [20000, '20k'],
        2: [100000, '100k'],
        3: [200000, '200k'],
        4: [500000, '500k'],
        5: [1000000, '1M']
    };
    const [score, scoreText] = scoreMap[minerLevel] || [0, 'unknown'];
    if (score === 0) {
        throw new Error(`Invalid miner level: ${minerLevel}`);
    }
    return [score, scoreText];
};

const getClaimScore = (minerLevel) => {
    const scoreMap = {
        1: [1500, '1.5k'],
        2: [3000, '3k'],
        3: [5000, '5k'],
        4: [6000, '6k'],
        5: [9000, '9k']
    };
    const [score, scoreText] = scoreMap[minerLevel] || [0, 'unknown'];
    if (score === 0) {
        throw new Error(`Invalid miner level: ${minerLevel}`);
    }
    return [score, scoreText];
};

// Upgrade endpoint
async function upgrade(req, res, next) {
    try {
        const userId = req.user.id;
        const earnings = await Earnings.findOne({ where: { userid: userId } });

        if (!earnings) {
            return next(new Error(`No earnings record found for ${userId}`));
        }

        let minerLevel = parseInt(earnings.miner_level, 10) || 0;
        let score = parseInt(earnings.tap_score, 10) || 0;

        console.log(`User ID: ${userId}`);
        console.log(`Current miner level: ${minerLevel}`);
        console.log(`Current score: ${score}`);

        if (minerLevel < 5) {
            const nextMinerLevel = minerLevel + 1;
            const [requiredScore] = getRequiredScore(nextMinerLevel);

            console.log(`Next miner level: ${nextMinerLevel}`);
            console.log(`Required score for next level: ${requiredScore}`);

            if (score >= requiredScore) {
                score -= requiredScore;
                await earnings.update({ tap_score: score, miner_level: nextMinerLevel });
                return res.status(200).json({
                    statusCode: 200,
                    status: 'success',
                    miner_level: nextMinerLevel,
                    score,
                    message: 'Successfully upgraded'
                });
            } else {
                return next(new Error(`Insufficient balance for ${userId} to upgrade from ${minerLevel} to ${nextMinerLevel}. Current score: ${score}, Required score: ${requiredScore}`));
            }
        } else {
            return next(new Error(`User exceeds upgrade level ${userId}`));
        }
    } catch (error) {
        console.error('Error in upgrade function:', error);
        return next(error);
    }
}


// Claim endpoint
const claim = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const earnings = await Earnings.findOne({ where: { userid: userId } });

        if (!earnings) {
            return next(new Error(`No earnings record found for ${userId}`));
        }

        let minerLevel = parseInt(earnings.miner_level, 10) || 0;
        let lastMineDate = earnings.last_mine_date ? moment.utc(earnings.last_mine_date) : null;
        const currentBatch = findBatch();
        let claim = false;

        if (minerLevel > 0) {
            if (!lastMineDate) {
                claim = true;
            } else {
                const lastDate = lastMineDate.format('YYYY-MM-DD');
                const currentDate = getCurrentDateFormatted();
                if (currentDate > lastDate || (currentDate === lastDate && findBatch(lastMineDate) < currentBatch)) {
                    claim = true;
                }
            }

            if (claim) {
                let score = parseInt(earnings.tap_score, 10) || 0;
                const [claimScore] = getClaimScore(minerLevel);
                score += claimScore;
                lastMineDate = moment.utc().toDate();

                await earnings.update({ tap_score: score, last_mine_date: lastMineDate });
                return res.status(200).json({
                    statusCode: 200,
                    status: 'success',
                    last_mine_date: lastMineDate,
                    score,
                    message: 'Successfully claimed'
                });
            } else {
                return next(new Error(`Invalid claim request for ${userId}`));
            }
        }

    } catch (error) {
        return next(error);
    }
};



module.exports = {
    claim,
    upgrade
};
