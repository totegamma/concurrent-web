import { useEffect, useState } from 'react';
import { Avatar, Box, Button, Divider, List, ListItem, ListItemAvatar, ListItemButton, ListItemText, Paper, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { pki, md, util } from 'node-forge';

import { usePersistent } from './hooks/usePersistent';
import { Timeline } from './components/Timeline';

import { useObjectList } from './hooks/useObjectList';
import { useResourceManager } from './hooks/useResourceManager';
import { RTMMessage, User } from './model';

const profile_schema = 'https://raw.githubusercontent.com/totegamma/concurrent-schemas/master/characters/profile/v1.json';

function App() {

    const [server, setServer] = usePersistent<string>("ServerAddress", "");
    const [pubkey, setPubKey] = usePersistent<string>("PublicKey", "");
    const [prvkey, setPrvKey] = usePersistent<string>("PrivateKey", "");

    const [followee, setFollowee] = usePersistent<User[]>("Follow", []);

    const [username, setUsername] = usePersistent<string>("Username", "anonymous");
    const [avatar, setAvatar] = usePersistent<string>("AvatarURL", "");

    const [draft, setDraft] = useState<string>("");
    const [mode, setMode] = useState<string>("htl");

    const messages = useObjectList<RTMMessage>();

    const userDict = useResourceManager<User>(async (key: string) => {
        const res = await fetch(server + 'characters?author=' + encodeURIComponent(key) + '&schema=' + encodeURIComponent(profile_schema), {
            method: 'GET',
            headers: {}
        });
        const data = await res.json();
        const payload = JSON.parse(data.characters[0].payload)
        return {
            pubkey: data.characters[0].author,
            username: payload.username,
            avatar: payload.avatar,
            description: payload.description
        };
    });


    useEffect(() => {
        if (pubkey == "" && prvkey == "") regenerateKeys();
        reload();
    }, []);

    useEffect(() => {
        reload();
    }, [mode]);

    const reload = () => {

        let url = (mode == 'ltl') ? server + 'messages'
                                  : server + 'messages?users=' + encodeURIComponent(followee.map(e => e.pubkey).join(','))

        const requestOptions = {
            method: 'GET',
            headers: {}
        };

        fetch(url, requestOptions)
        .then(res => res.json())
        .then(data => {
            console.log(data);
            messages.clear();
            data.messages.reverse().forEach((e: any) => messages.push(e));
        });
    }

    const regenerateKeys = () => {
        pki.rsa.generateKeyPair({bits: 512, workers: 2}, function(_, keypair) {
            let publickey = pki.publicKeyToPem(keypair.publicKey);
            let privatekey = pki.privateKeyToPem(keypair.privateKey);

            publickey = publickey.replace("-----BEGIN PUBLIC KEY-----", "");
            publickey = publickey.replace("-----END PUBLIC KEY-----", "");
            publickey = publickey.replace(/\r?\n/g, '');

            privatekey = privatekey.replace("-----BEGIN RSA PRIVATE KEY-----", "");
            privatekey = privatekey.replace("-----END RSA PRIVATE KEY-----", "");
            privatekey = privatekey.replace(/\r?\n/g, '');

            setPubKey(publickey);
            setPrvKey(privatekey);
        });
    }

    const post = () => {

        let privatekey = pki.privateKeyFromPem(
            "-----BEGIN RSA PRIVATE KEY-----"
            + prvkey
            + "-----END RSA PRIVATE KEY-----");

        const payload_obj = {
            'body': draft
        }

        const payload = JSON.stringify(payload_obj);

        let hash = md.sha256.create();
        hash.update(payload, 'utf8');
        let signature = util.encode64(privatekey.sign(hash));
        console.log(signature);

        const requestOptions = {
            method: 'POST',
            headers: {},
            body: JSON.stringify({'author': pubkey, 'payload': payload, 'signature': signature})
        };

        fetch(server + 'messages', requestOptions)
        .then(res => res.json())
        .then(data => {
            console.log(data);
            setDraft("");
            reload();
        });
    }

    const updateProfile = () => {
        let privatekey = pki.privateKeyFromPem(
            "-----BEGIN RSA PRIVATE KEY-----"
            + prvkey
            + "-----END RSA PRIVATE KEY-----");

        const payload_obj = {
            'username': username,
            'avatar': avatar,
            'description': ''
        }

        const payload = JSON.stringify(payload_obj);

        let hash = md.sha256.create();
        hash.update(payload, 'utf8');
        let signature = util.encode64(privatekey.sign(hash));
        console.log(signature);

        const requestOptions = {
            method: 'PUT',
            headers: {},
            body: JSON.stringify({
                'author': pubkey,
                'schema': profile_schema,
                'payload': payload,
                'signature': signature
            })
        };

        fetch(server + 'characters', requestOptions)
        .then(res => res.json())
        .then(data => {
            console.log(data);
            setDraft("");
            reload();
        });

    }

    const follow = async (userid: string) => {
        if (followee.find(e => e.pubkey == userid)) return;
        let user = await userDict.get(userid)
        setFollowee([...followee, user]);
    }

    const unfollow = (pubkey: string) => {
        setFollowee(followee.filter(e => e.pubkey != pubkey));
    }

    return (<Box sx={{display: "flex", padding: "10px", gap: "10px", backgroundColor: "#f2f2f2", width: "100vw", height: "100vh", justifyContent: "center"}}>
        <Paper sx={{width: "800px", padding: "15px", display: "flex", flexFlow: "column"}}>
            <Box sx={{display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "5px"}}>
            <Typography variant="h5" gutterBottom>Timeline</Typography>
            <ToggleButtonGroup
                color="primary"
                value={mode}
                exclusive
                onChange={(_, newvalue) => {setMode(newvalue)}}
                aria-label="Platform"
                >
                <ToggleButton value="htl">HTL</ToggleButton>
                <ToggleButton value="ltl">LTL</ToggleButton>
            </ToggleButtonGroup>
            </Box>
            <Divider/>
            <Box sx={{overflowY: "scroll"}}>
                <Timeline messages={messages} clickAvatar={follow} userDict={userDict}/>
            </Box>
        </Paper>
        <Box sx={{display: "flex", flexDirection: "column", gap: "15px"}}>
            <Paper sx={{width: "300px", padding: "5px"}}>
                <Typography variant="h5" gutterBottom>Post</Typography>
                <Divider/>
                <Box sx={{display: "flex", flexDirection: "column", padding: "15px", gap: "5px"}}>
                    <TextField multiline rows={6} label="message" variant="outlined" value={draft} onChange={(e) => setDraft(e.target.value)}/>
                    <Button variant="contained" onClick={_ => post()}>post</Button>
                </Box>
            </Paper>

            <Paper sx={{width: "300px", padding: "5px"}}>
                <Typography variant="h5" gutterBottom>Following</Typography>
                <Divider/>
                <Box sx={{display: "flex", flexDirection: "column", gap: "5px"}}>
                    <List dense sx={{ width: '100%', maxWidth: 360, bgcolor: 'background.paper' }}>
                    {followee.map((value) => {
                        const labelId = `checkbox-list-secondary-label-${value.pubkey}`;
                        return (
                        <ListItem
                            key={value.username}
                            secondaryAction={
                                <Button onClick={() => unfollow(value.pubkey)}>unfollow</Button>
                            }
                            disablePadding
                        >
                            <ListItemButton>
                                <ListItemAvatar>
                                    <Avatar src={value.avatar} />
                                </ListItemAvatar>
                                <ListItemText id={labelId} primary={value.username} />
                            </ListItemButton>
                        </ListItem>
                        );
                    })}
                    </List>
                </Box>
            </Paper>

            <Paper sx={{width: "300px", padding: "5px"}}>
                <Typography variant="h5" gutterBottom>Profile</Typography>
                <Divider/>
                <Box sx={{display: "flex", flexDirection: "column", padding: "15px", gap: "5px"}}>
                    <TextField label="username" variant="outlined" value={username} onChange={(e) => setUsername(e.target.value)}/>
                    <TextField label="avatarURL" variant="outlined" value={avatar} onChange={(e) => setAvatar(e.target.value)}/>
                    <Button variant="contained" onClick={_ => updateProfile()}>Update</Button>
                </Box>
            </Paper>

            <Paper sx={{width: "300px", padding: "5px"}}>
                <Typography variant="h5" gutterBottom>Settings</Typography>
                <Divider/>
                <Box sx={{display: "flex", flexDirection: "column", padding: "15px", gap: "5px"}}>
                    <TextField label="server" variant="outlined" value={server} onChange={(e) => setServer(e.target.value)}/>
                    <TextField label="privateKey" variant="outlined" value={prvkey} onChange={(e) => setPrvKey(e.target.value)}/>
                    <TextField label="publicKey" variant="outlined" value={pubkey} onChange={(e) => setPubKey(e.target.value)}/>
                    <Button variant="contained" onClick={_ => regenerateKeys()}>Generate Key</Button>
                </Box>
            </Paper>
        </Box>
    </Box>)
}

export default App
