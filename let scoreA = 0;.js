let scoreA = 0;
let scoreB = 0;
let gameOver = false;

function addScore(team) {
    if (gameOver) return;

    if (team === 'A') {
        scoreA++;
        document.getElementById('scoreA').innerText = scoreA;
    } else {
        scoreB++;
        document.getElementById('scoreB').innerText = scoreB;
    }

    checkWinner();
}

function subScore(team) {
    if (gameOver) return;

    if (team === 'A' && scoreA > 0) {
        scoreA--;
        document.getElementById('scoreA').innerText = scoreA;
    } else if (team === 'B' && scoreB > 0) {
        scoreB--;
        document.getElementById('scoreB').innerText = scoreB;
    }
}

function checkWinner() {
    // กัติตาตะกร้อทั่วไป: ชนะที่ 21 คะแนน
    // ถ้าดิวส์ (Deuce) 20-20 ต้องห่างกัน 2 คะแนน แต่สูงสุดไม่เกิน 25 คะแนน
    
    if (scoreA >= 21 || scoreB >= 21) {
        if (Math.abs(scoreA - scoreB) >= 2 || scoreA === 25 || scoreB === 25) {
            gameOver = true;
            let winner = scoreA > scoreB ? 'ทีม A' : 'ทีม B';
            alert(`🎉 ยินดีด้วย! ${winner} เป็นฝ่ายชนะในเซตนี้!`);
        }
    }
}

function resetScore() {
    scoreA = 0;
    scoreB = 0;
    gameOver = false;
    document.getElementById('scoreA').innerText = scoreA;
    document.getElementById('scoreB').innerText = scoreB;
}