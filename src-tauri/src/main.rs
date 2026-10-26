#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
fn main() {
    let arguments: Vec<String> = std::env::args().skip(1).collect();
    if arguments
        .first()
        .is_some_and(|value| value == "--keychain-self-test")
    {
        if let Err(error) = somedue_lib::keychain::self_test(&arguments[1..]) {
            eprintln!("{error}");
            std::process::exit(1);
        }
        return;
    }
    somedue_lib::run();
}
