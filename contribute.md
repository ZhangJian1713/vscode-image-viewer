## 1. Development Guide

### 1.1 Debug and develop
// clone to local  
``git clone git@github.com:ZhangJian1713/easy-vscode.git``  
// install packages  
``yarn``  
Now you can press F5 to debug the extension in a new popup VSCode instance.  

### 1.2 Publish
You need to register an account at: https://marketplace.visualstudio.com/  
// install vsce  
``sudo npm install -g vsce``  
// build a local install file  
``vsce package``  
// publish patch[minor|major] version  
``vsce publish patch``  






