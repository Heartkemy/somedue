//! Native boundary probe. Uses the same synthetic test path as the installed app.
//! Run create, read, update, read-updated, delete in separate processes.
#[path = "../src/keychain.rs"]
mod keychain;

fn main() -> Result<(), String> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    keychain::self_test(&args)?;
    // The regression runner changes this marker to force distinct caller bytes.
    println!("Keychain synthetic verification passed: process complete");
    Ok(())
}
