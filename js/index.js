$(function(){
    const init_ctn = function () {
        console.log("欢迎访问我得小站...");
    };

    init_ctn();

    $("#a_home").click(function(){
        alert("欢迎访问 Github ！")
        window.open("https://github.com/yuanq20");
    });


});