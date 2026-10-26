//! macOS credential boundary. Password values never leave native IPC as a response,
//! enter command arguments, or get persisted to the app database.
//! Packaged certificate-signed builds require a frozen helper, following the reference.
//! Only unsigned development builds may use the direct native-keyring path.
use security_framework::passwords::{
    delete_generic_password, generic_password, set_generic_password, PasswordOptions,
};

const SERVICE: &str = "io.somedue.desktop.things-cloud.v1";
const ITEM_NOT_FOUND: i32 = -25300;

fn validate_account(account: &str) -> Result<(), String> {
    if account.is_empty() || account.len() > 512 || account.contains('\0') {
        return Err("The Keychain account identifier is invalid.".into());
    }
    Ok(())
}

fn message(code: i32) -> String {
    match code {
        ITEM_NOT_FOUND => {
            "No saved Things Cloud credentials. Connect your account in Settings.".into()
        }
        -128 => "Keychain access was cancelled. Retry and allow access to Somedue.".into(),
        -25293 => "Keychain access was denied. Unlock your login Keychain and retry.".into(),
        -25308 => "Keychain requires interaction. Unlock your Mac and retry from Somedue.".into(),
        _ => format!(
            "macOS Keychain operation failed ({code}). Unlock your login Keychain and retry."
        ),
    }
}

fn direct_set(account: &str, password: &str) -> Result<(), String> {
    validate_account(account)?;
    if password.is_empty() || password.len() > 64 * 1024 {
        return Err("Credentials are empty or exceed the supported size.".into());
    }
    set_generic_password(SERVICE, account, password.as_bytes())
        .map_err(|error| message(error.code()))
}

fn direct_get(account: &str) -> Result<String, String> {
    validate_account(account)?;
    let bytes = generic_password(PasswordOptions::new_generic_password(SERVICE, account))
        .map_err(|error| message(error.code()))?;
    String::from_utf8(bytes)
        .map_err(|_| "Saved credentials are invalid. Reconnect your account in Settings.".into())
}

fn direct_delete(account: &str) -> Result<(), String> {
    validate_account(account)?;
    match delete_generic_password(SERVICE, account) {
        Ok(()) => Ok(()),
        Err(error) if error.code() == ITEM_NOT_FOUND => Ok(()),
        Err(error) => Err(message(error.code())),
    }
}

fn helper(operation: &str, account: &str, password: Option<&str>) -> Result<String, String> {
    use std::io::{Read, Write};
    use std::os::fd::OwnedFd;
    use std::os::unix::net::UnixStream;
    use std::process::{Command, Stdio};
    validate_account(account)?;
    let executable =
        std::env::current_exe().map_err(|_| "Cannot locate the installed application.")?;
    let resource = executable
        .parent()
        .and_then(|p| p.parent())
        .ok_or("Cannot locate the installed application resources.")?
        .join("Resources/somedue-keychain");
    let signer = option_env!("SOMEDUE_SIGNER").ok_or(
        "This build has no pinned Keychain signing identity. Rebuild with the package script.",
    )?;
    let requirement =
        format!("=identifier \"io.somedue.keychain\" and certificate leaf = H\"{signer}\"");
    let valid = Command::new("/usr/bin/codesign")
        .args(["--verify", "--strict", "-R", &requirement])
        .arg(&resource)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|_| "Cannot verify the Keychain helper.")?;
    if !valid.success() {
        return Err("The signed Keychain helper is missing or invalid. Reinstall Somedue; credentials remain in Keychain.".into());
    }
    let (mut socket, child_socket) =
        UnixStream::pair().map_err(|_| "Cannot create the private Keychain channel.")?;
    let output: OwnedFd = child_socket.into();
    let mut child = Command::new(resource)
        .arg(operation)
        .arg(account)
        .stdin(if password.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::from(output))
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|_| "Cannot launch the signed Keychain helper.")?;
    if let Some(password) = password {
        if let Some(mut input) = child.stdin.take() {
            if input.write_all(password.as_bytes()).is_err() {
                let _ = child.kill();
                let _ = child.wait();
                return Err("The Keychain helper rejected its private channel. Reinstall the signed application.".into());
            }
        }
    }
    let mut bytes = Vec::new();
    if (&mut socket)
        .take(64 * 1024 + 1)
        .read_to_end(&mut bytes)
        .is_err()
    {
        let _ = child.kill();
        let _ = child.wait();
        return Err("The private Keychain channel was interrupted. Retry the operation.".into());
    }
    let output = child
        .wait_with_output()
        .map_err(|_| "Cannot finish the Keychain operation.")?;
    if !output.status.success() {
        // The helper emits only a fixed prefix and an OSStatus, never values.
        let stderr = String::from_utf8_lossy(&output.stderr);
        let code = stderr
            .split('(')
            .nth(1)
            .and_then(|s| s.split(')').next())
            .and_then(|s| s.parse::<i32>().ok());
        return Err(code.map(message).unwrap_or_else(|| {
            "Keychain helper failed. Unlock your login Keychain and retry.".into()
        }));
    }
    if bytes.len() > 64 * 1024 {
        return Err("Keychain response exceeded the supported size.".into());
    }
    String::from_utf8(bytes)
        .map_err(|_| "Saved credentials are invalid. Reconnect your account.".into())
}

fn use_helper() -> bool {
    option_env!("SOMEDUE_SIGNER").is_some()
}

pub fn cloud_available() -> bool {
    use_helper() || cfg!(debug_assertions)
}

pub fn require_cloud() -> Result<(), String> {
    if cloud_available() {
        Ok(())
    } else {
        Err(
            "This download is local-only. Experimental Things Cloud sync requires a source build."
                .into(),
        )
    }
}

pub fn set(account: &str, password: &str) -> Result<(), String> {
    validate_account(account)?;
    if password.is_empty() || password.len() > 64 * 1024 {
        return Err("Credentials are empty or exceed the supported size.".into());
    }
    if use_helper() {
        helper("set", account, Some(password)).map(|_| ())
    } else if cfg!(debug_assertions) {
        direct_set(account, password)
    } else {
        Err("This release was built without its signing identity. Rebuild using the macOS package script.".into())
    }
}

pub fn get(account: &str) -> Result<String, String> {
    if use_helper() {
        helper("get", account, None)
    } else if cfg!(debug_assertions) {
        direct_get(account)
    } else {
        Err("This release was built without its signing identity. Rebuild using the macOS package script.".into())
    }
}

pub fn delete(account: &str) -> Result<(), String> {
    if use_helper() {
        helper("delete", account, None).map(|_| ())
    } else if cfg!(debug_assertions) {
        direct_delete(account)
    } else {
        Err("This release was built without its signing identity. Rebuild using the macOS package script.".into())
    }
}

/// Exercise the installed executable's signed Keychain path with synthetic data.
/// Deliberately restrict the namespace and fixture; never accept a real secret.
pub fn self_test(arguments: &[String]) -> Result<(), String> {
    if arguments.len() != 2 || !arguments[1].starts_with("verification-") {
        return Err("Usage: --keychain-self-test create|read|update|read-updated|delete|cloud verification-UNIQUE-ID".into());
    }
    let account = &arguments[1];
    let original = r#"{"password":"synthetic-keychain-fixture","history":"synthetic"}"#;
    let updated = r#"{"password":"synthetic-keychain-fixture-updated","history":"synthetic"}"#;
    match arguments[0].as_str() {
        "cloud" => require_cloud()?,
        "create" => set(account, original)?,
        "read" => {
            if get(account)? != original {
                return Err("Synthetic credential mismatch".into());
            }
        }
        "update" => set(account, updated)?,
        "read-updated" => {
            if get(account)? != updated {
                return Err("Updated synthetic credential mismatch".into());
            }
        }
        "delete" => {
            delete(account)?;
            if get(account).is_ok() {
                return Err("Synthetic item remains after deletion".into());
            }
            delete(account)?;
        }
        _ => return Err("Unknown verification operation".into()),
    }
    println!("Keychain synthetic verification passed: {}", arguments[0]);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invalid_identifiers_fail_before_keychain_access() {
        for account in ["", "a\0b", &"a".repeat(513)] {
            assert!(get(account).is_err());
            assert!(set(account, "synthetic-test-value").is_err());
            assert!(delete(account).is_err());
        }
        assert!(set("verification-unit", "").is_err());
    }

    #[test]
    fn errors_are_actionable_and_do_not_echo_credentials() {
        assert!(message(ITEM_NOT_FOUND).contains("Settings"));
        assert!(message(-25308).contains("Unlock"));
        assert!(message(-128).contains("cancelled"));
    }
}
