use soroban_sdk::{contracttype, String};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MatchResult {
    Player1Wins,
    Player2Wins,
    Draw,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct ResultEntry {
    pub game_id: String,
    pub result: MatchResult,
    pub submitted_ledger: u32,
}

#[contracttype]
pub enum DataKey {
    Admin,
    Result(u64), // keyed by match_id
    ResultCount, // total number of results ever submitted
}
