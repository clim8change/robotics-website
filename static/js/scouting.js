// https://stackoverflow.com/questions/44709114/javascript-screen-orientation-on-safari
var mql = window.matchMedia("(orientation: portrait)");
if(mql.matches) { /* Portrait orientation */ }
else { /* Landscape orientation */ }
mql.addListener(function(m) {
    if(m.matches) { /* Changed to portrait */ }
    else { /* Changed to landscape */ }
})

let autonActions = []
let teleopActions = []

class NiceError extends Error {
    constructor(message) {
        super(message)
    }
}

function sleep(duration) {
    return new Promise(function(resolve, reject){
        setTimeout(function(){
            resolve();
        }, duration)
    });
};

async function initiate(selector) {
    var el = document.querySelectorAll(selector);
    var time_to_start = 150
    var time_online = 100
    var time_offline = 70
    el.forEach(e => e.classList.remove('active'))
    await sleep(time_to_start)
    el.forEach(e => e.classList.add('active'))
    await sleep(time_offline)
    el.forEach(e => e.classList.remove('active'))
    await sleep(time_online)
    el.forEach(e => e.classList.add('active'))
};

async function cfetch(url, options) {
    options = options || {}
    options.credentials = 'same-origin'
    const res = await fetch(url, options)
    const text = await res.text()
    try {
        return JSON.parse(text)
    } catch (e) {
        if (res.status == 200) return true;
        throw new NiceError(text.match('<p>(.*?)</p>')[1].replace(/<\/?strong>/g, ''))
    }
}

(async () => {
    const match = 1; //Number(prompt('Match number'));
    const json = await cfetch(`/member/scouting/request/${match}`);
    const TOURN_ID = json.tournament.id
    const RANK = json.scouting.rank
    const ROUND = json.scouting.round
    const BLUE = json.scouting.blue
    const TEAM = json.scouting.team

    document.getElementById('autonslider').classList.add(BLUE ? 'blue' : 'red')

    await sleep(100);
    await initiate('#scouting');
    await initiate('#field');
    await initiate('.work-area');
    await initiate('.loading-area');
    await initiate('.switch');
    await initiate('#scale');

    document.getElementById('go').addEventListener('click', () => {
        let start_position = document.getElementById('autonslider').value
        if (!BLUE) start_position *= -1
        let time = 3;
        let auton = true;
        document.getElementById('autonslider').style.display = 'none'
        setInterval(() => {
            time -= 1;
            if (time == 0) {
                if (auton) {
                    auton = false;
                    time = 3;
                } else {
                    finalize({
                        headers: {
                            rank: RANK,
                            blue: BLUE,
                            team: TEAM,
                            round: ROUND,
                            tournament_id: TOURN_ID,
                            forceUpload: true
                        }, data: {
                            start_position: start_position,
                        }
                    });
                    return;
                }
            }
            document.getElementById('clock').innerHTML = `${Math.floor(time/60)}:${time%60}`
        }, 1000)

        document.getElementById('scale').addEventListener('click', () => {
            (auton ? autonActions : teleopActions).push({
                timestamp: Date.now(),
                action: '0_0_1'
            })
        });
        document.getElementById('red-switch').addEventListener('click', () => {
            (auton ? autonActions : teleopActions).push({
                timestamp: Date.now(),
                action: BLUE ? '0_0_2' : '0_0_0'
            })
        });
        document.getElementById('blue-switch').addEventListener('click', () => {
            (auton ? autonActions : teleopActions).push({
                timestamp: Date.now(),
                action: BLUE ? '0_0_0' : '0_0_2'
            })
        });
        document.getElementById('red-loading-area').addEventListener('click', () => {
            (auton ? autonActions : teleopActions).push({
                timestamp: Date.now(),
                action: '0_0_3'
            })
        });
        document.getElementById('blue-loading-area').addEventListener('click', () => {
            (auton ? autonActions : teleopActions).push({
                timestamp: Date.now(),
                action: '0_0_3'
            })
        });
    })
})().catch((e) => {
    console.error(e)
    alert((e instanceof NiceError) ? e.message : 'Scouting API Error! Yay!')
});

function finalize(data) {
    document.getElementById('main').style.display = 'none'
    document.getElementById('final').style.display = 'block'


    document.getElementById('formsub').addEventListener('click', (e) => {
        e.preventDefault();
        var crossed = JSON.parse(document.querySelector('input[name="crossedline"]:checked').value)
        var endedplat = JSON.parse(document.querySelector('input[name="endedplat"]:checked').value)
        var lifted = JSON.parse(document.querySelector('input[name="lifted"]:checked').value)
        data.data.crossed_line = crossed
        data.data.end_platform = endedplat
        data.data.lift = lifted
        data.data['auton-actions'] = autonActions
        data.data['teleop-actions'] = teleopActions
        cfetch('/member/scouting/upload', {
            body: JSON.stringify(data),
            credentials: 'same-origin',
            headers: {
                'content-type': 'application/json'
            },
            method: 'POST'
        }).then(() => {
            window.location.reload()
        }, (e) => {
            console.error(e)
            alert((e instanceof NiceError) ? e.message : 'Scouting API Error! Yay!')
        })
    })

}